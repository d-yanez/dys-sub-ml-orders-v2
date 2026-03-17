# Skill: Project AI Context Bootstrap

## Propósito
Crear una estructura estándar de documentación operativa para IA dentro de cualquier proyecto, de modo que futuros chats, desarrolladores o asistentes como Codex puedan entender rápidamente el contexto del sistema sin depender de un chat previo.

## Cuándo usar esta skill
Usar esta skill cuando:
- se inicia un proyecto nuevo
- se quiere preparar un repo para trabajar con IA
- se necesita reducir dependencia de la ventana de contexto
- se quiere dejar memoria operativa persistente en archivos `.md`
- se quiere estandarizar onboarding para IA y desarrolladores

## Objetivo
Crear una carpeta `docs/ai/` con archivos cortos, útiles y no redundantes, enfocados en:
- contexto general
- estado actual
- memoria del proyecto
- reglas de trabajo
- índice de skills
- plantilla para pedir features
- skills por dominio
- mapa del sistema

## Estructura base esperada

```txt
docs/
  ai/
    START_HERE.md
    AI_CONTEXT.md
    AI_SYSTEM_MAP.md
    CURRENT_STATE.md
    PROJECT_MEMORY.md
    WORKING_RULES.md
    SKILL_INDEX.md
    FEATURE_REQUEST_TEMPLATE.md
    CHANGELOG_AI.md
    skills/
      [skills específicas del proyecto]
```


## Extensión opcional: documentación técnica general del repo

Si el proyecto aún no tiene documentación base suficiente, además de `docs/ai/` crear o completar en `docs/`:

- `ARCHITECTURE.md`
- `ENGINEERING_PRACTICES.md`
- `README.md`
- `RELEASE_PROCESS.md`
- `SDD.md`
- `CHANGELOG.md`

### Regla
Estos archivos deben:
- estar basados en el estado real del repo
- servir como documentación técnica para humanos
- no duplicar innecesariamente la información de `docs/ai/`

### Diferencia esperada
- `docs/`: documentación técnica general del repositorio
- `docs/ai/`: contexto persistente y operativo para IA