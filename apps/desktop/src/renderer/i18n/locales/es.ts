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
		sandbox: "Modo de ejecución",
		sandboxPlan: "Modo plan",
		sandboxReadOnly: "Confirmar antes de cambios",
		sandboxWorkspaceWrite: "Auto editar",
		sandboxFullAccess: "Acceso total",
		loginRequired: "{{name}} — requiere iniciar sesión",
	},
	taskCatalog: {
		view: "Vista de tareas",
		workspace: "Espacio de trabajo",
		timeline: "Línea de tiempo",
		searchPlaceholder: "Buscar tareas…",
		activeNow: "Activos ahora",
		recent: "Recientes",
	},
	cliApprovals: {
		title: "El agente quiere usar {{name}}",
		allow: "Permitir",
		allowSession: "Permitir en la sesión",
		deny: "Denegar",
	},
	settings: {
		language: "Idioma",
		languageDescription: "Idioma de la interfaz (inglés o español)",
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
			"Conversa por turnos con cualquier runtime compatible (OpenCode, Codex, Claude Code, …). GCode mantiene la sesión para conservar el contexto entre turnos.",
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
	litShell: {
		newSession: "Nueva sesión",
		newSessionTitle: "Nueva sesión",
		settings: "Ajustes",
		back: "Volver",
		emptySessions: "Aún no hay sesiones. Crea una para chatear con OpenCode, Codex o Claude.",
		welcomeTitle: "¿Qué construimos?",
		welcomeBody: "Elige una sesión o crea una nueva. Espacio multi-agente denso: runtimes, herramientas y aprobaciones en un solo lugar.",
		composerHint: "Enter para enviar · Shift+Enter para nueva línea",
		systemReady: "Shell Lit de GCode listo. Las sesiones y herramientas usan el bridge del host cuando Electron está disponible.",
		sessionOpened: "Sesión abierta {{id}}",
		offlineReply: "Recibido: {{text}}\n\n(Conecta un runtime para turnos de agente en vivo.)",
		turnFailed: "El turno falló: {{error}}",
	},
}
