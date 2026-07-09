/**
 * Spanish locale. Mirrors the English base (`en`) — the `TranslationKey` type
 * is derived from `en`, so this file must keep the same shape.
 */
import type { LocaleMessages } from "../index"

export const es: LocaleMessages = {
	subagent: {
		title: "Subagente",
		description:
			"Delega una tarea a una CLI de agente local. Se ejecuta sin interfaz y devuelve su resultado aquí.",
		noneInstalled:
			"No hay ninguna CLI de agente compatible instalada. Instala Codex o Claude Code para delegar tareas.",
		agentLabel: "Agente",
		promptLabel: "Tarea",
		promptPlaceholder: "Describe la tarea para el agente…",
		workingDirLabel: "Directorio de trabajo",
		workingDirPlaceholder: "/ruta/al/proyecto",
		sandboxLabel: "Sandbox",
		sandbox: {
			readOnly: "Solo lectura",
			workspaceWrite: "Escritura en el proyecto",
			dangerFullAccess: "Acceso total",
		},
		run: "Ejecutar subagente",
		running: "Ejecutando…",
		cancel: "Cancelar",
		result: "Resultado",
		usage: "{{input}} entrada · {{output}} salida tokens",
		failed: "El subagente falló: {{error}}",
		empty: "Sin salida todavía. Escribe una tarea y ejecuta el subagente.",
	},
	runtimePicker: {
		runtime: "Runtime de sesión",
		model: "Modelo",
		defaultModel: "Modelo por defecto",
		effort: "Esfuerzo de razonamiento",
		effortDefault: "Esfuerzo por defecto",
		effortLevel: "{{level}}",
		sandbox: "Sandbox",
		sandboxPlan: "Plan (solo lectura)",
		sandboxReadOnly: "Solo lectura",
		sandboxWorkspaceWrite: "Escritura en el proyecto",
		sandboxFullAccess: "Acceso total (herramientas de agente)",
		loginRequired: "{{name}} — requiere iniciar sesión",
	},
	cliApprovals: {
		title: "El agente quiere usar {{name}}",
		allow: "Permitir",
		allowSession: "Permitir en la sesión",
		deny: "Denegar",
	},
	settings: {
		language: "Idioma",
		languageDescription: "Idioma de las partes nuevas de la interfaz",
	},
	queuedMessage: {
		sendNow: "Enviar ahora",
		sending: "Enviando…",
		cancel: "Cancelar",
		cancelling: "Cancelando…",
		queued: "En cola",
	},
	subagentChat: {
		title: "Agentes de runtime",
		description:
			"Conversa por turnos con cualquier runtime compatible (OpenCode, Codex, Claude Code, …). Palot mantiene la sesión para conservar el contexto entre turnos.",
		noneInstalled:
			"No hay ningún runtime compatible instalado. Instala OpenCode, Codex o Claude Code para empezar.",
		you: "Tú",
		thinking: "Pensando…",
		send: "Enviar",
		stop: "Detener",
		newConversation: "Nueva conversación",
		inputPlaceholder: "Mensaje a {{agent}}…",
		emptyState:
			"Empieza una conversación con {{agent}}. Se ejecuta sin interfaz y recuerda esta sesión entre turnos.",
		contextKept: "Sesión guardada · el contexto se conserva entre turnos",
	},
}
