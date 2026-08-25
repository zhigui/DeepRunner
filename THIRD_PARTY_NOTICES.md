# Third-Party Notices

DeepRunner includes and redistributes third-party software. Each third-party component remains subject to its own license; the GNU Affero General Public License governing DeepRunner does not replace those terms.

## DeepSeek Harness

DeepRunner uses a pinned release of the official DeepSeek Harness runtime:

- Project: https://github.com/deepseek-ai/deepseek-harness
- Runtime version and source commit: see `upstream.json` at the repository root; release artifacts retain the same provenance record at `resources/legal/upstream.json`
- License: MIT
- Copyright (c) 2026 DeepSeek

```text
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Other runtime components

Release artifacts also contain Electron, Chromium, Node.js, pnpm, and their production dependency closure. Exact component versions are identified by the lockfile, release SBOM, and package metadata in the application bundle. Package-supplied `LICENSE`, `NOTICE`, `COPYING`, and equivalent files must be retained and must not be removed from release artifacts.

Build and test tools do not become part of a DeepRunner release merely because they appear in development dependencies. Before publication, the complete dependency closure and its licenses must be audited from the actual packaged artifact.

## Branding and affiliation

DeepRunner is an independently developed, unofficial client. It is not a DeepSeek product and is not affiliated with, sponsored by, or endorsed by DeepSeek. The names “DeepSeek” and “DeepSeek Harness” are used only to identify compatibility and the upstream project. Copyright permissions granted by software licenses do not include rights to third-party trademarks.
