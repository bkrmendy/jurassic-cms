import { vercelStegaCombine, vercelStegaSplit } from "npm:@vercel/stega";
import { oakCors } from "https://deno.land/x/cors/mod.ts";
import { Router, Application } from "./deps.ts";

const app = new Application();
const router = new Router();

interface DB {
  [key: string]: string;
}

const db: DB = {
  title: "The Return of the Sith",
  rating: "best of the prequels",
  hello: "there",
};

router.get("/api/:key", ({ response, params }) => {
  console.log(`GET /api/${params.key}`);
  const key = params.key;
  if (!(key in db)) {
    response.status = 400;
    response.body = {
      success: false,
      msg: "Key not found",
    };
    return;
  }

  response.body = vercelStegaCombine(db[key], { key });
});

router.post("/api/:key", async ({ request, response, params }) => {
  console.log(`POST /api/${params.key}`);
  if (!request.body()) {
    response.status = 400;
    response.body = {
      success: false,
      msg: "The request must have a body",
    };
    return;
  }

  const payload = JSON.parse(await request.body().value);
  if (!("value" in payload)) {
    response.status = 400;
    response.body = {
      success: false,
      msg: "The request body must have a data prop",
    };
    return;
  }

  db[params.key] = vercelStegaSplit(payload.value).cleaned;

  response.status = 200;
});

app.use(oakCors({ origin: "http://localhost:8000" }));
app.use(router.routes());

const env = Deno.env.toObject();
const PORT = env.PORT || 6789;
const HOST = env.HOST || "0.0.0.0";

console.log(`Server running on port ${PORT}`);

app.listen(`${HOST}:${PORT}`);
