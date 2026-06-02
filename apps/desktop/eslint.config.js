import path from "node:path"
import { fileURLToPath } from "node:url"
import tseslint from "typescript-eslint"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const crossRuntimeRestricted = {
	paths: [
		{
			name: "../../../preload/api",
			message: "Use @desktop/preload (public-api.ts).",
		},
		{
			name: "../../../preload/api.d",
			message: "Use @desktop/preload (public-api.ts).",
		},
		{
			name: "../../../shared",
			message: "Use @desktop/shared (index.ts).",
		},
		{
			name: "@desktop/shared/*",
			message: "Import from @desktop/shared (barrel), not subpaths.",
		},
	],
	patterns: [
		{
			group: ["../../../*"],
			message: "Use @desktop/shared or @desktop/preload instead of deep relative paths.",
		},
	],
}

/** Block importing feature internals from outside that feature (renderer shell only). */
const featureBarrelRestricted = {
	paths: [
		{
			name: "@/features/automations/ui",
			message: "Import from @/features/automations (public API).",
		},
		{
			name: "@/features/automations/ui/*",
			message: "Import from @/features/automations (public API).",
		},
		{
			name: "@/features/settings/ui",
			message: "Import from @/features/settings (public API).",
		},
		{
			name: "@/features/settings/ui/*",
			message: "Import from @/features/settings (public API).",
		},
		{
			name: "@/features/onboarding/ui",
			message: "Import from @/features/onboarding (public API).",
		},
		{
			name: "@/features/onboarding/ui/*",
			message: "Import from @/features/onboarding (public API).",
		},
		{
			name: "@/features/chat/ui",
			message: "Import from @/features/chat (public API).",
		},
		{
			name: "@/features/chat/ui/*",
			message: "Import from @/features/chat (public API).",
		},
	],
}

/** Inside feature ui/: still enforce cross-runtime + shell paths; allow relative imports within feature. */
const featureUiShellRestricted = {
	paths: [
		{
			name: "../../../components",
			message: "Use @/components/public (shell API).",
		},
		{
			name: "../../../../components",
			message: "Use @/components/public (shell API).",
		},
	],
	patterns: [
		{
			group: ["../../../components/*", "../../../../components/*"],
			message: "Use @/components/public (shell API).",
		},
	],
}

/** Feature ui may use ../../../atoms|hooks|lib|services; not preload/shared/components deep paths. */
const featureUiRestricted = {
	paths: [...crossRuntimeRestricted.paths, ...featureUiShellRestricted.paths],
	patterns: featureUiShellRestricted.patterns,
}

const featureUiOverride = (feature) => ({
	files: [`src/renderer/features/${feature}/ui/**/*`],
	rules: {
		"no-restricted-imports": ["error", featureUiRestricted],
	},
})

const tsLanguageOptions = {
	parser: tseslint.parser,
	parserOptions: {
		ecmaVersion: "latest",
		sourceType: "module",
		tsconfigRootDir: __dirname,
	},
}

export default tseslint.config(
	{
		ignores: ["out/**", "dist/**", "release/**", "node_modules/**", "src/renderer/dist/**"],
	},
	{
		files: ["src/main/**/*.ts", "src/preload/**/*.ts"],
		languageOptions: tsLanguageOptions,
		rules: {
			"no-restricted-imports": ["error", crossRuntimeRestricted],
		},
	},
	{
		files: ["src/renderer/**/*.{ts,tsx}"],
		languageOptions: tsLanguageOptions,
		rules: {
			"no-restricted-imports": [
				"error",
				{
					...crossRuntimeRestricted,
					...featureBarrelRestricted,
				},
			],
		},
	},
	featureUiOverride("automations"),
	featureUiOverride("settings"),
	featureUiOverride("onboarding"),
	featureUiOverride("chat"),
	{
		files: ["test/**/*.ts"],
		languageOptions: tsLanguageOptions,
		rules: {
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "../src/shared",
							message: "Use @desktop/shared (index.ts).",
						},
					],
					patterns: [
						{
							group: ["../src/shared/*"],
							message: "Use @desktop/shared (barrel), not subpaths.",
						},
					],
				},
			],
		},
	},
)