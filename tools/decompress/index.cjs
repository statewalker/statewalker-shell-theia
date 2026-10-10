// `decompress` for CommonJS callers (`require("decompress")(input, output, options)`), backed by
// @xhmikosr/decompress, which is ESM-only. Same signature and the same promise of extracted files.
module.exports = (input, output, options) =>
  import("@xhmikosr/decompress").then(({ default: decompress }) =>
    decompress(input, output, options),
  );
