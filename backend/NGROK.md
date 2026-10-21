# Running the backend through ngrok

Use ngrok only when a public HTTPS URL is needed for the locally running API.

## 1. Start the backend

From the repository root:

```sh
cd backend
npm run dev
```

This starts the Express API gateway on `http://localhost:4000` and its required local gRPC services.

Check it locally:

```sh
curl http://localhost:4000/health
```

## 2. Start the tunnel

In a second terminal:

```sh
ngrok http 4000
```

ngrok prints a public address such as:

```text
https://example.ngrok-free.dev
```

The frontend API base URL must include the API prefix:

```text
https://example.ngrok-free.dev/api/v1
```

## 3. Configure CORS

Set `FRONTEND_ORIGIN` in the backend environment to a comma-separated list of frontend origins allowed to call the API. For example:

```text
FRONTEND_ORIGIN=http://localhost:3000,https://your-project.vercel.app
```

`DEPLOYED_FRONTEND_ORIGIN` can add one additional deployed origin. Restart the backend after changing either value.

## Stop the tunnel

Press `Ctrl+C` in the terminal running ngrok. This stops only the public URL; the local backend remains available on port 4000.
