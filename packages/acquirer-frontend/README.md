## Getting Started

```bash
npm install
```

```bash
cp .env.example .env
npm run dev
```

## Configuration

| Environment Variables     | Default Values                 | Description                                                                                |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| `VITE_PORT`               | `5172`                         | Port number for the Vite development server. The production container listens on `5173`.  |
| `VITE_HOST`               | `0.0.0.0`                      | Host IP address for the Vite development server.                                           |
| `VITE_API_URL`            | `http://localhost:5555/api/v1` | Backend API URL. The production container applies it at startup through `config.js`.       |
| `VITE_RECAPTCHA_SITE_KEY` | `recaptcha-site-key`           | reCAPTCHA site key. The production container applies it at startup through `config.js`.    |

## Development Notes

- `acquirer-frontend` uses an import sorting package to enforce consistency. You need to add the folder name in the `importOrder` array in the `.prettierc` file whenever you add a new folder under `src` folder to make it work.

- Always place CSS imports at the lowest to avoid a quirk of the import sorting algorithm. You can see the standard to follow in the `main.tsx`.
