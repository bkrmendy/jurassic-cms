import { vercelStegaCombine, vercelStegaSplit } from "npm:@vercel/stega";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import type { Response } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const status200 = <T extends Response["body"]>(response: Response, body: T) => {
  response.status = 200;
  response.body = body;
};

const status400 = (response: Response, message: string) => {
  response.status = 400;
  response.body = { success: false, message: message };
};

const app = new Application();
const router = new Router();

const create_client = () => {
  return new Client({
    user: "postgres",
    database: "postgres",
    hostname: "localhost",
    port: 45678,
  });
};

async function setup_db() {
  const client = create_client();
  await client.connect();
  await client.queryObject(`create table if not exists config (
    project_id TEXT,
    key TEXT,
    value TEXT,
    PRIMARY KEY(project_id, key)
  )`);
}

async function get_key({
  projectId,
  key,
}: {
  projectId: string;
  key: string;
}): Promise<string | null> {
  const client = create_client();

  const result = await client.queryArray(
    "SELECT value FROM config WHERE project_id = $1 AND key = $2;",
    [projectId, key]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0][0] as string;
}

async function set_key({
  projectId,
  key,
  value,
}: {
  projectId: string;
  key: string;
  value: string;
}): Promise<void> {
  const client = create_client();
  await client.queryArray(
    "INSERT INTO config (project_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (project_id, key) DO UPDATE SET value = excluded.value;",
    [projectId, key, value]
  );
}

router.get("/api/:project_id/:key", async ({ response, params }) => {
  await setup_db();
  const { key, project_id } = params;
  const result = await get_key({ projectId: project_id, key: key });
  if (result == null) {
    status400(response, "Key not found");
    return;
  }
  status200(response, vercelStegaCombine(result, { project_id, key }));
});

router.post("/api/:project_id/:key", async ({ request, response, params }) => {
  if (!request.body()) {
    status400(response, "The request must have a body");
    return;
  }

  const payload = await request.body({ type: "json" }).value;
  if (!("value" in payload)) {
    status400(response, "The request body must have a data prop");
    return;
  }

  const { cleaned } = vercelStegaSplit(payload.value);
  if (cleaned === "non") {
    status400(response, "Non!");
    return;
  }

  await setup_db();
  await set_key({
    projectId: params.project_id,
    key: params.key,
    value: cleaned,
  });

  status200(response, cleaned);
});

app.use(oakCors({ origin: "http://localhost:8000" }));
app.use(router.routes());

const env = Deno.env.toObject();
const PORT = env.PORT || 6789;
const HOST = env.HOST || "0.0.0.0";

console.log(`Server running on port ${PORT}`);

app.listen(`${HOST}:${PORT}`);
