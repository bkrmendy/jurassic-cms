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

const env = Deno.env.toObject();

async function with_db<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const DATABASE_URL =
    env.DATABASE_URL ?? "postgres://postgres@localhost:45678/postgres";
  const client = new Client(DATABASE_URL);

  await client.connect();

  const result = await fn(client);

  await client.end();
  return result;
}

async function setup_db(client: Client) {
  await client.queryObject(`CREATE TABLE IF NOT EXISTS config (
    project_id TEXT,
    key TEXT,
    value TEXT,
    PRIMARY KEY(project_id, key)
  );`);
}

async function get_key(
  client: Client,
  {
    projectId,
    key,
  }: {
    projectId: string;
    key: string;
  }
): Promise<string | null> {
  const result = await client.queryArray(
    "SELECT value FROM config WHERE project_id = $1 AND key = $2;",
    [projectId, key]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0][0] as string;
}

async function get_all_keys(
  client: Client,
  projectId: string
): Promise<Array<{ key: string; value: string }>> {
  const result = await client.queryArray(
    "SELECT key, value FROM config WHERE project_id = $1;",
    [projectId]
  );

  return result.rows.map((row) => ({
    key: row[0] as string,
    value: row[1] as string,
  }));
}

async function set_key(
  client: Client,
  {
    projectId,
    key,
    value,
  }: {
    projectId: string;
    key: string;
    value: string;
  }
): Promise<void> {
  await client.queryArray(
    "INSERT INTO config (project_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (project_id, key) DO UPDATE SET value = excluded.value;",
    [projectId, key, value]
  );
}

router.post("/api/hydrate", async ({ response }) => {
  await with_db(async (client) => {
    await setup_db(client);
    await set_key(client, {
      projectId: "33",
      key: "title",
      value: "Chapter 1",
    });

    await set_key(client, {
      projectId: "33",
      key: "author",
      value: "Charles Dickens",
    });

    await set_key(client, {
      projectId: "33",
      key: "description",
      value: "A masterpiece for the ages",
    });
    response.status = 200;
  });
});

router.get("/api/:project_id/keys", async ({ response, params }) => {
  await with_db(async (client) => {
    const keys = await get_all_keys(client, params.project_id);
    status200(response, keys);
  });
});

router.get("/api/:project_id/:key", async ({ response, params }) => {
  const { key, project_id } = params;
  const result = await with_db(async (client) => {
    await setup_db(client);
    return await get_key(client, { projectId: project_id, key: key });
  });
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

  await with_db(async (client) => {
    await setup_db(client);
    await set_key(client, {
      projectId: params.project_id,
      key: params.key,
      value: cleaned,
    });
  });

  status200(response, cleaned);
});

app.use(oakCors({ origin: ["http://localhost:8000", "https://utopia.pizza"] }));
app.use(router.routes());

const PORT = env.PORT || 6789;
const HOST = "0.0.0.0";

console.log(`Server running on port ${PORT}`);

app.listen(`${HOST}:${PORT}`);
