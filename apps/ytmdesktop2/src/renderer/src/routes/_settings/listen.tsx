import { DEFAULT_RELAY_URL } from "@shared/listen/protocol";
import { YtmdLink } from "@shared/protocol/ytmdProtocol";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsInput } from "@/components/settings-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_settings/listen")({
	component: ListenSettingsPage,
});

function ListenSettingsPage() {
	const utils = trpc.useUtils();
	const { data: status } = trpc.listen.status.useQuery();
	trpc.listen.onStatus.useSubscription(undefined, { onData: (next) => utils.listen.status.setData(undefined, next) });
	const { mutateAsync: host, isPending: hostPending } = trpc.listen.host.useMutation();
	const { mutateAsync: join, isPending: joinPending } = trpc.listen.join.useMutation();
	const { mutateAsync: leave } = trpc.listen.leave.useMutation();
	const [code, setCode] = useState("");

	const mode = status?.mode ?? "idle";
	const busy = !!status?.connecting || hostPending || joinPending;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Listen Together</CardTitle>
				<CardDescription>
					Host a room and friends who join hear the same track, in sync. The host controls playback; guests just listen.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<FieldGroup>
					<SettingsInput
						configKey="listen.relayUrl"
						label="Relay server"
						placeholder={DEFAULT_RELAY_URL || "wss://relay.example.com"}
						hint={DEFAULT_RELAY_URL ? "Leave empty to use the built-in relay. Everyone in a room must use the same one." : "Everyone in a room must use the same relay. Run your own with apps/listen-relay."}
						disabled={mode !== "idle"}
					/>
				</FieldGroup>

				{mode === "idle" ? (
					<div className="flex flex-col gap-3">
						<Button disabled={busy} onClick={() => void host()}>
							Host a room
						</Button>
						<div className="flex gap-2">
							<Input value={code} maxLength={6} placeholder="Room code" onChange={(ev) => setCode(ev.target.value.toUpperCase())} />
							<Button variant="outline" disabled={busy || code.length !== 6} onClick={() => void join(code)}>
								Join
							</Button>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<p className="text-sm">
							{mode === "host" ? `Hosting room ${status?.code} · ${status?.listeners ?? 0} listening` : `Listening in room ${status?.code}`}
						</p>
						<div className="flex gap-2">
							{mode === "host" && status?.code ? (
								<Button
									variant="outline"
									onClick={() => navigator.clipboard.writeText(YtmdLink.listen(status.code!)).then(() => toast.success("Invite link copied"))}
								>
									Copy invite link
								</Button>
							) : null}
							<Button variant="destructive" onClick={() => void leave()}>
								{mode === "host" ? "End session" : "Leave"}
							</Button>
						</div>
					</div>
				)}
				{status?.error ? <p className="text-xs text-destructive">{status.error}</p> : null}
			</CardContent>
		</Card>
	);
}
