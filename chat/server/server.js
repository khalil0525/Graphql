import { ApolloServer } from "@apollo/server";
import { expressMiddleware as apolloMiddleware } from "@apollo/server/express4";
import cors from "cors";
import express from "express";
import { readFile } from "node:fs/promises";
import { useServer as useWsServer } from "graphql-ws/lib/use/ws";
import { createServer as createHttpServer } from "node:http";
import { authMiddleware, decodeToken, handleLogin } from "./auth.js";
import { resolvers } from "./resolvers.js";
import { WebSocketServer } from "ws";
import { makeExecutableSchema } from "@graphql-tools/schema";

const PORT = 9000;

const app = express();
app.use(cors(), express.json());

app.post("/login", handleLogin);

function getHttpContext({ req }) {
	if (req.auth) {
		return { user: req.auth.sub };
	}
	return {};
}

function getWsContext({ connectionParams }) {
	const accessToken = connectionParams?.accessToken;
	console.log(connectionParams);
	if (accessToken) {
		const payload = decodeToken(accessToken);
		return { user: payload.sub };
	}
	return {};
}

const typeDefs = await readFile("./schema.graphql", "utf8");
const schema = makeExecutableSchema({ typeDefs, resolvers }); // To be able to use a websocket server, we need to expose the graphql schema.
const apolloServer = new ApolloServer({ schema }); // Here, instead of {typeDefs, resolvers} we can just pass our schema made above
await apolloServer.start();
app.use(
	"/graphql",
	authMiddleware,
	apolloMiddleware(apolloServer, {
		context: getHttpContext,
	})
);

const httpServer = createHttpServer(app); // To use websockets we need to create an HTTP server, this takes the express server into it's parameters
const wsServer = new WebSocketServer({ server: httpServer }); // This is the websocket server, it takes the http server in the params
useWsServer({ schema, context: getWsContext }, wsServer); // This is a special hook given in the graphql package
httpServer.listen({ port: PORT }, () => {
	// Previously we were using an express server, now we are using http server, we passed the express app server to the http server. This is neeeded for ws
	console.log(`Server running on port ${PORT}`);
	console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
});
