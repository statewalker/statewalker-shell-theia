import { type FilesApi, writeText } from "@statewalker/webrun-files";
import { CommonMenus } from "@theia/core/lib/browser/common-menus";
import { FrontendApplicationContribution } from "@theia/core/lib/browser/frontend-application-contribution";
import { OpenerService, open } from "@theia/core/lib/browser/opener-service";
import {
  type Command,
  CommandContribution,
  type CommandRegistry,
} from "@theia/core/lib/common/command";
import { MenuContribution, type MenuModelRegistry } from "@theia/core/lib/common/menu";
import URI from "@theia/core/lib/common/uri";
import { ContainerModule, inject, injectable } from "@theia/core/shared/inversify";
import { FilesApiRootLabel } from "@theia-shell/theia-files-api";
import { bootGate } from "@theia-shell/theia-files-mounts/lib/browser/boot-gate";
import {
  MainStorageInitializer,
  MainStorageService,
} from "@theia-shell/theia-files-mounts/lib/browser/main-storage";
import { MountDefaults } from "@theia-shell/theia-files-mounts/lib/browser/mount-preferences";
import { MountService } from "@theia-shell/theia-files-mounts/lib/browser/mount-service";
import { MarkdownNewFileFolder } from "@theia-shell/theia-markdown/lib/browser/markdown-contribution";
import { SEED } from "./seed";
import { seedIfEmpty } from "./seed-if-empty";

/** For the e2e tests and the devtools console: the filtered root, and the boot gate. */
@injectable()
class ExposeForTests implements FrontendApplicationContribution {
  @inject(MountService) protected readonly mounts!: MountService;

  async onStart(): Promise<void> {
    const filesApi: FilesApi = await this.mounts.start();
    (window as unknown as { theiaShell: object }).theiaShell = { filesApi, bootGate };
  }
}

/** Whether this visit seeded the main storage, i.e. it was empty: a first visit. */
let seeded = false;

const WELCOME_PATH = "/welcome.md";
const WELCOME: Command = { id: "app.welcome", category: "Help", label: "Welcome" };

/**
 * The welcome file: opened on a first visit when no layout was restored
 * (`initializeLayout`, which the app awaits before showing the shell), and by
 * *Help → Welcome*, which writes it again if it was deleted.
 */
@injectable()
class Welcome implements FrontendApplicationContribution, CommandContribution, MenuContribution {
  @inject(MainStorageService) protected readonly main!: MainStorageService;
  @inject(OpenerService) protected readonly opener!: OpenerService;

  async initializeLayout(): Promise<void> {
    await this.main.open();
    if (seeded) await this.open();
  }

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(WELCOME, { execute: () => this.open() });
  }

  registerMenus(menus: MenuModelRegistry): void {
    menus.registerMenuAction(CommonMenus.HELP, { commandId: WELCOME.id, order: "0" });
  }

  protected async open(): Promise<void> {
    const { storage, files } = await this.main.open();
    if (!(await files.exists(WELCOME_PATH)))
      await writeText(files, WELCOME_PATH, SEED[WELCOME_PATH] as string);
    await open(this.opener, new URI(`file:///${storage.key}${WELCOME_PATH}`));
  }
}

/**
 * The app's file system: mounts over a main storage (theia-files-mounts).
 * This module only sets the app's defaults and seeds the main storage with
 * the demo files the first time (before anything lists it).
 */
export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
  rebind(MountDefaults).toConstantValue({
    mounts: [{ key: "temp", name: "Temporary", type: "memory", config: {} }],
    hidden: ["**/.git", "**/.git/**", "**/.DS_Store"],
  });
  bind(MainStorageInitializer).toConstantValue(async ({ files }: { files: FilesApi }) => {
    seeded = await seedIfEmpty(files, SEED);
  });
  rebind(FilesApiRootLabel).toConstantValue("Files");
  // The root above the mounts is read-only: new Markdown files go to the main storage.
  bind(MarkdownNewFileFolder).toDynamicValue(({ container }) => async () => {
    const main = await container.get(MainStorageService).open();
    return new URI(`file:///${main.storage.key}`);
  });
  bind(ExposeForTests).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(ExposeForTests);
  bind(Welcome).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(Welcome);
  bind(CommandContribution).toService(Welcome);
  bind(MenuContribution).toService(Welcome);
});
