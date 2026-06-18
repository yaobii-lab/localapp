---
name: Bug report
about: Something localapp got wrong on your machine
labels: bug
---

**What you ran**

```
$ localapp …
```

**What you expected**

A one-line description of the resolved answer you expected.

**What you got**

Paste the output, including `--json` if relevant.

**Environment**

- macOS version:
- Node version (`node -v`):
- localapp version (`localapp --version`):
- Shell:

**One extra thing that would help**

If the bug involves a port, the output of `lsof -nP -iTCP -sTCP:LISTEN` (redact whatever you want) makes diagnosis dramatically faster.
