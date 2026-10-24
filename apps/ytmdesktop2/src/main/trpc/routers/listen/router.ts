import { fromIpcEvent } from "@main/trpc/fromIpcEvent";
import { provider } from "@main/trpc/provider";
import type { ListenStatus } from "@shared/listen/protocol";
import { publicProcedure, router } from "@shared/trpc/trpc";
import { z } from "zod";

export const listenRouter = router({
	status: publicProcedure.query(({ ctx }): ListenStatus => provider(ctx, "listen").getStatus()),
	onStatus: publicProcedure.subscription(() => fromIpcEvent<ListenStatus>("listen.status")),
	host: publicProcedure.mutation(({ ctx }) => provider(ctx, "listen").host()),
	join: publicProcedure.input(z.string()).mutation(({ ctx, input }) => provider(ctx, "listen").join(input)),
	leave: publicProcedure.mutation(({ ctx }) => provider(ctx, "listen").leave()),
});
