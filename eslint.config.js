import js from "@eslint/js";
import vue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import vueTs from "@vue/eslint-config-typescript";
import prettier from "@vue/eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...vue.configs["flat/essential"],
  ...vueTs(),
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.vue"],
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },
  prettier,
);
