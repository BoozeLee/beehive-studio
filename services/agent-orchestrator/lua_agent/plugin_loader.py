"""Plugin loader — discovers and loads agent plugins from directories."""

from __future__ import annotations

import importlib.util
import inspect
import logging
import sys
from pathlib import Path
from types import ModuleType
from typing import Dict, List, Optional

from .agent import LuaAgent
from .sdk import BaseAgent

logger = logging.getLogger(__name__)


class PluginLoader:
    """
    Discovers and loads agent plugins from filesystem directories.
    Supports:
    - .lua files → LuaAgent
    - .py files → Python agents (classes inheriting BaseAgent)
    - Directory-based plugins with metadata
    """

    def __init__(self):
        self._watch_dirs: List[Path] = []
        self._loaded: Dict[str, BaseAgent] = {}
        self._load_errors: Dict[str, str] = {}

    @property
    def load_errors(self) -> Dict[str, str]:
        return dict(self._load_errors)

    def add_plugin_dir(self, path: str) -> None:
        """Add a directory to watch for agent plugins."""
        p = Path(path).resolve()
        if p.is_dir() and p not in self._watch_dirs:
            self._watch_dirs.append(p)
            logger.info(f"Watching plugin directory: {p}")

    def scan(self) -> List[str]:
        """Scan all watched directories for plugins. Returns list of loaded names."""
        discovered = []
        self._load_errors.clear()

        for plugin_dir in self._watch_dirs:
            if not plugin_dir.exists():
                continue

            # Load .lua plugins
            for fpath in sorted(plugin_dir.glob("*.lua")):
                name = self._load_lua_plugin(fpath)
                if name:
                    discovered.append(name)

            # Load .py plugins
            for fpath in sorted(plugin_dir.glob("*.py")):
                if fpath.name.startswith("_"):
                    continue
                name = self._load_python_plugin(fpath)
                if name:
                    discovered.append(name)

            # Load directory-based plugins (contain __init__.py or agent metadata)
            for subdir in sorted(plugin_dir.iterdir()):
                if not subdir.is_dir() or subdir.name.startswith("_"):
                    continue
                name = self._load_directory_plugin(subdir)
                if name:
                    discovered.append(name)

        return discovered

    def _load_lua_plugin(self, fpath: Path) -> Optional[str]:
        """Load a .lua file as a LuaAgent plugin."""
        name = fpath.stem
        if name in self._loaded:
            return None
        try:
            script = fpath.read_text(encoding="utf-8")
            agent = LuaAgent(script, name=name, description=f"Lua plugin: {fpath.name}")
            agent.metadata["source"] = str(fpath)
            agent.metadata["type"] = "lua"
            self._loaded[name] = agent
            logger.info(f"Loaded Lua plugin: {name} from {fpath}")
            return name
        except Exception as e:
            self._load_errors[name] = str(e)
            logger.error(f"Failed to load Lua plugin {fpath}: {e}")
            return None

    def _load_python_plugin(self, fpath: Path) -> Optional[str]:
        """Load a .py file as a Python agent plugin."""
        name = fpath.stem
        if name in self._loaded:
            return None
        try:
            spec = importlib.util.spec_from_file_location(name, fpath)
            if spec is None or spec.loader is None:
                raise ImportError(f"Could not load spec from {fpath}")
            mod = importlib.util.module_from_spec(spec)
            sys.modules[name] = mod
            spec.loader.exec_module(mod)

            # Find BaseAgent subclasses in the module
            agents_found = self._extract_agents_from_module(mod, name, str(fpath))
            if not agents_found:
                logger.warning(f"No BaseAgent subclass found in {fpath}")
                return None
            return agents_found[0]
        except Exception as e:
            self._load_errors[name] = str(e)
            logger.error(f"Failed to load Python plugin {fpath}: {e}")
            return None

    def _load_directory_plugin(self, subdir: Path) -> Optional[str]:
        """Load a directory-based plugin (with __init__.py)."""
        name = subdir.name
        if name in self._loaded:
            return None
        init_file = subdir / "__init__.py"
        if not init_file.exists():
            return None
        try:
            spec = importlib.util.spec_from_file_location(name, init_file)
            if spec is None or spec.loader is None:
                raise ImportError(f"Could not load spec from {init_file}")
            mod = importlib.util.module_from_spec(spec)
            sys.modules[name] = mod
            spec.loader.exec_module(mod)

            agents_found = self._extract_agents_from_module(mod, name, str(subdir))
            if not agents_found:
                logger.warning(f"No BaseAgent subclass found in {subdir}")
                return None
            return agents_found[0]
        except Exception as e:
            self._load_errors[name] = str(e)
            logger.error(f"Failed to load directory plugin {subdir}: {e}")
            return None

    def _extract_agents_from_module(self, mod: ModuleType, default_name: str, source: str) -> List[str]:
        """Find all BaseAgent subclasses in a module and register them."""
        found = []
        for attr_name in dir(mod):
            attr = getattr(mod, attr_name)
            if not inspect.isclass(attr):
                continue
            if not issubclass(attr, BaseAgent) or attr is BaseAgent:
                continue
            try:
                instance: BaseAgent = attr()
                instance.metadata["source"] = source
                instance.metadata["type"] = "python"
                self._loaded[instance.name] = instance
                found.append(instance.name)
                logger.info(f"Loaded Python agent: {instance.name} from {source}")
            except Exception as e:
                logger.error(f"Failed to instantiate {attr_name} from {source}: {e}")
        return found

    def get(self, name: str) -> Optional[BaseAgent]:
        """Get a loaded plugin by name."""
        return self._loaded.get(name)

    def list(self) -> List[str]:
        """List all loaded plugin names."""
        return list(self._loaded.keys())

    def unload(self, name: str) -> None:
        """Unload a plugin by name."""
        agent = self._loaded.pop(name, None)
        if agent is not None:
            agent.cleanup()

    def reload(self, name: str) -> Optional[BaseAgent]:
        """Reload a plugin by name (re-scans from source)."""
        agent = self._loaded.get(name)
        if agent is None:
            return None
        source = agent.metadata.get("source", "")
        self.unload(name)
        if source.endswith(".lua"):
            self._load_lua_plugin(Path(source))
        elif source.endswith(".py"):
            self._load_python_plugin(Path(source))
        return self._loaded.get(name)
