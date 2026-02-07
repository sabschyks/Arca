import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"], // Suporte a require() e import
  dts: true, // Gera arquivos de tipos .d.ts
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false, // Minificar apenas em release
  target: "es2022",
  tsconfig: "./tsconfig.json"
});
