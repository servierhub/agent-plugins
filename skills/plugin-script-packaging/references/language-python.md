# Python packaging

Use this reference only when the implementation or requested runtime is Python.

## Build ownership

Keep Python source, tests, `pyproject.toml`, and a fully resolved hash-pinned lock outside the installed Skill. Pin the Python version and implementation. Review licenses, entry points, environment markers, native extensions, namespace packages, and package data. End-user installation must not invoke pip or contact an index.

## Source/Git projection

For pure-Python code and dependencies, build a deterministic zip application such as `scripts/<command>.pyz` and invoke it with the declared interpreter:

~~~text
python3 scripts/<command>.pyz ...
~~~

The archive contains the application and exact locked runtime dependencies. It ignores user site packages, avoids repository imports, and resolves resources through package APIs. Record interpreter constraint, lock hash, files, sizes, hashes, and notices.

A plain zipapp is insufficient for arbitrary native-extension dependencies. If the graph contains compiled wheels or external libraries, produce explicit target-specific artifacts or mark generic Git/source installation unsupported. Never fall back to system packages or an online install.

## Native release projection

Use a pinned standalone compiler/freezer such as PyInstaller or Nuitka only after reviewing target and licensing behavior. Produce one executable per target at `scripts/<command>[.exe]`. Exclude `.py`, `.pyc`, virtual environments, wheels, lockfiles, build caches, and the source `.pyz` unless the profile explicitly uses it instead of a native executable.

## Required checks

- Rebuild the `.pyz` twice and compare inventories and hashes.
- Execute with user-site loading disabled and no project directory on `PYTHONPATH`.
- Verify package data, Unicode paths, entry points, and locked versions.
- Reject undeclared native extensions and unsupported interpreters.
- Run frozen executables without Python, pip, virtual environments, or project source.
- Reject packages mixing `.pyz`/source runtime and native executable material.
