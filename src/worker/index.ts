import { crearApp } from "./app";
import { crearDb } from "./db";

export default crearApp((env) => crearDb(env.DATABASE_URL));
