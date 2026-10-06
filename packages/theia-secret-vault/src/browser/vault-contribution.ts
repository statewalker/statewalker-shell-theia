import { CommonMenus } from "@theia/core/lib/browser/common-menus";
import { ConfirmDialog } from "@theia/core/lib/browser/dialogs";
import type { FrontendApplicationContribution } from "@theia/core/lib/browser/frontend-application-contribution";
import { StatusBar, StatusBarAlignment } from "@theia/core/lib/browser/status-bar/status-bar";
import type { Command, CommandContribution, CommandRegistry } from "@theia/core/lib/common/command";
import type { MenuContribution, MenuModelRegistry } from "@theia/core/lib/common/menu";
import { MessageService } from "@theia/core/lib/common/message-service";
import { inject, injectable } from "@theia/core/shared/inversify";
import { WrongPasswordError } from "../common/secret-vault";
import { type VaultDialogMode, VaultPasswordDialog } from "./vault-dialog";
import { VaultService } from "./vault-service";

export namespace VaultCommands {
  const category = "Secrets";
  export const UNLOCK: Command = { id: "secrets.unlock", category, label: "Unlock" };
  export const LOCK: Command = { id: "secrets.lock", category, label: "Lock" };
  export const CHANGE_PASSWORD: Command = {
    id: "secrets.changePassword",
    category,
    label: "Change Password",
  };
  export const FORGET: Command = {
    id: "secrets.forget",
    category,
    label: "Forget Remembered Password",
  };
  export const RESET: Command = { id: "secrets.reset", category, label: "Reset Vault" };
}

const STATUS_ID = "secrets-vault";
/** *File → Secrets*, next to the other storage commands. */
const SECRETS_MENU = [...CommonMenus.FILE_OPEN, "z_secrets"];

/**
 * The vault's UI: the unlock-or-create prompt at start, the commands, the
 * *File → Secrets* menu, and a status-bar lock that shows the state and toggles it.
 */
@injectable()
export class VaultUi
  implements FrontendApplicationContribution, CommandContribution, MenuContribution
{
  @inject(VaultService) protected readonly vaults!: VaultService;
  @inject(MessageService) protected readonly messages!: MessageService;
  @inject(StatusBar) protected readonly statusBar!: StatusBar;

  /**
   * The start-up prompt opens before the workbench restores its layout, so
   * that files on mounts needing a secret can be restored once it is answered
   * (the mounts wait for `VaultService.startupUnlock`). Not awaited: startup
   * waits for it only where something needs the vault.
   */
  onStart(): void {
    void this.ensureUnlocked(() => this.vaults.markStartupPrompt()).finally(() =>
      this.vaults.endStartupUnlock(),
    );
    void this.vaults.vault().then((vault) => {
      this.updateStatus(vault.unlocked);
      vault.onDidChangeLock((unlocked) => this.updateStatus(unlocked));
    });
  }

  protected updateStatus(unlocked: boolean): void {
    void this.statusBar.setElement(STATUS_ID, {
      text: unlocked ? "$(unlock) Secrets unlocked" : "$(lock) Secrets locked",
      tooltip: unlocked
        ? "Secrets (S3 keys, …) are unlocked. Click to lock them."
        : "Secrets (S3 keys, …) are locked. Click to unlock them.",
      alignment: StatusBarAlignment.LEFT,
      priority: 49,
      command: unlocked ? VaultCommands.LOCK.id : VaultCommands.UNLOCK.id,
    });
  }

  /** Unlocks, asking when it must (`onPrompt` is told). Resolves false if the user skipped. */
  async ensureUnlocked(onPrompt?: () => void): Promise<boolean> {
    try {
      const state = await this.vaults.unlockSilently();
      if (state === "unlocked") return true;
      onPrompt?.();
      return await this.prompt(state === "needs-new-password" ? "create" : "unlock");
    } catch (error) {
      // A corrupt vault file (tampered, or from another vault): say so; nothing is overwritten.
      this.messages.error(
        `Secrets: ${(error as Error).message}. The vault stays locked; “Secrets: Reset Vault” starts a new one.`,
      );
      return false;
    }
  }

  protected async prompt(mode: VaultDialogMode): Promise<boolean> {
    const vault = await this.vaults.vault();
    const title = {
      create: "Protect your secrets",
      unlock: "Unlock secrets",
      change: "Change the secrets password",
    }[mode];
    const result = await new VaultPasswordDialog({
      title,
      mode,
      submit: (value) =>
        this.run(async () => {
          const key =
            mode === "create"
              ? await vault.create(value.password)
              : mode === "unlock"
                ? await vault.unlock(value.password)
                : await vault.changePassword(value.password);
          if (value.remember) await this.vaults.remember(key);
        }),
    }).open();
    return !!result;
  }

  /** A vault operation for a dialog's `submit`: "" when done, else the error to show in the dialog. */
  protected async run(operation: () => Promise<void>): Promise<string> {
    try {
      await operation();
      return "";
    } catch (error) {
      if (error instanceof WrongPasswordError) return "Wrong password. Try again.";
      return `Secrets: ${(error as Error).message}`;
    }
  }

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(VaultCommands.UNLOCK, {
      execute: () => this.ensureUnlocked(),
      isEnabled: () => !this.vaults.current?.unlocked,
    });
    commands.registerCommand(VaultCommands.LOCK, {
      execute: () => this.vaults.current?.lock(),
      isEnabled: () => !!this.vaults.current?.unlocked,
    });
    commands.registerCommand(VaultCommands.CHANGE_PASSWORD, {
      execute: () => this.prompt("change"),
      isEnabled: () => !!this.vaults.current?.unlocked,
    });
    commands.registerCommand(VaultCommands.FORGET, { execute: () => this.vaults.forget() });
    commands.registerCommand(VaultCommands.RESET, { execute: () => this.reset() });
  }

  registerMenus(menus: MenuModelRegistry): void {
    menus.registerSubmenu(SECRETS_MENU, "Secrets", { sortString: "z3" });
    const commands = [
      VaultCommands.UNLOCK,
      VaultCommands.LOCK,
      VaultCommands.CHANGE_PASSWORD,
      VaultCommands.FORGET,
      VaultCommands.RESET,
    ];
    commands.forEach((command, i) => {
      menus.registerMenuAction(SECRETS_MENU, { commandId: command.id, order: String(i) });
    });
  }

  protected async reset(): Promise<void> {
    const confirmed = await new ConfirmDialog({
      title: "Reset the secrets vault?",
      msg: "All stored secrets (S3 keys, …) are deleted and a new password is set. Files and settings are kept.",
      ok: "Reset",
    }).open();
    if (!confirmed) return;
    const vault = await this.vaults.vault();
    await new VaultPasswordDialog({
      title: "New secrets password",
      mode: "create",
      submit: (value) =>
        this.run(async () => {
          const key = await vault.reset(value.password);
          if (value.remember) await this.vaults.remember(key);
        }),
    }).open();
  }
}
