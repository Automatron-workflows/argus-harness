# Security

Argus Harness does not store credentials, tokens or customer rows. It reads a
project folder and, when configured, a source. HTTP headers can reference
environment variables; the values are resolved at load time and never written
back.

Please report:

- a secret accidentally committed to the repository or a demo;
- a path traversal through `static-json`, `csv` or a project path;
- a header injection or environment-variable leak;
- an untrusted project file causing code execution;
- a BigQuery identifier interpolation issue.

Do not open a public issue with a live token. Use GitHub's private vulnerability
reporting for this repository, or contact the maintainer directly.

The harness is not a security boundary. It does not authenticate a caller,
authorize a metric, sandbox `bq`, or verify that a source row is true.
