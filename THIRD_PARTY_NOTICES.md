# Third-party notices

This project's original code is MIT licensed. Dependencies remain under their own licenses. Versions below were checked for v3.0.0; the lockfile is the dependency version authority.

## Code included in browser bundles

| Package      | Version | License                       | License text                             |
| ------------ | ------- | ----------------------------- | ---------------------------------------- |
| React        | 19.3.0  | MIT                           | [React](docs/licenses/react.txt)         |
| React DOM    | 19.3.0  | MIT                           | [React DOM](docs/licenses/react-dom.txt) |
| Scheduler    | 0.28.0  | MIT                           | [Scheduler](docs/licenses/scheduler.txt) |
| Lucide React | 0.468.0 | ISC, with Feather attribution | [Lucide](docs/licenses/lucide-react.txt) |
| fflate       | 0.8.3   | MIT                           | [fflate](docs/licenses/fflate.txt)       |

The build includes these license texts in `dist/THIRD_PARTY_LICENSES.txt`. When upgrading bundled dependencies, update this list and copied license texts as necessary.

## Development and testing tools

TypeScript and Playwright use Apache-2.0. Vite, its React plugin, esbuild, Prettier and Undici use MIT. Wrangler declares MIT OR Apache-2.0. Their own packages contain their applicable licenses and transitive dependency notices; they are installed from npm rather than vendored here. Playwright browser downloads retain their own third-party notices.

No external images, logos, fonts or institutional documents are bundled. The screenshots in `docs/images` were captured from this project's local application with fictional sample sessions and contain no participant records or credentials.
