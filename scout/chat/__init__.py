"""scout.chat — the tool-using chat engine (port of internal/chat).

Public surface (imported by the web/CLI layer):
    Engine, new, MODEL
    system_prompt
"""
from .engine import MODEL, Engine, new
from .prompt import system_prompt

__all__ = ["MODEL", "Engine", "new", "system_prompt"]
