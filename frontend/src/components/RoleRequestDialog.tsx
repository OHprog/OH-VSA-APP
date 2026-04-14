import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface PendingRequest {
  requested_role: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoleRequestDialog({ open, onOpenChange }: Props) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);

  // Check for an existing pending request whenever the dialog opens
  useEffect(() => {
    if (!open || !user) return;

    setChecking(true);
    supabase
      .from("role_requests")
      .select("requested_role, created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle()
      .then(({ data }) => {
        setPendingRequest(data ?? null);
        setChecking(false);
      });
  }, [open, user]);

  // Reset form when closed
  useEffect(() => {
    if (!open) {
      setReason("");
      setPendingRequest(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!user || !role) return;

    setLoading(true);
    const { error } = await supabase
      .from("role_requests")
      .insert({
        user_id: user.id,
        requested_role: "analyst",
        from_role: role,
        reason: reason.trim() || null,
      });
    setLoading(false);

    if (error) {
      // Unique index violation — user already has a pending request
      if (error.code === "23505") {
        toast({ title: "You already have a pending request", description: "An admin will review it soon.", variant: "destructive" });
      } else {
        toast({ title: "Error submitting request", description: error.message, variant: "destructive" });
      }
      return;
    }

    // Notify all admins by email (fire-and-forget)
    supabase.functions
      .invoke("send-role-email", {
        body: {
          type: "new_request",
          requester_user_id: user.id,
          requested_role: "analyst",
          reason: reason.trim() || undefined,
        },
      })
      .then(({ error: fnErr }) => {
        if (fnErr) console.warn("[send-role-email] new_request failed:", fnErr.message);
      });

    toast({ title: "Request submitted", description: "An admin will review it soon." });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Request Role Upgrade</DialogTitle>
          <DialogDescription>
            Request access to the <strong>Analyst</strong> role — full access to
            suppliers, evaluations, and reports. An admin will review your request.
          </DialogDescription>
        </DialogHeader>

        {checking ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : pendingRequest ? (
          <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
            You already have a pending request for{" "}
            <span className="font-medium capitalize text-foreground">
              {pendingRequest.requested_role}
            </span>{" "}
            access, submitted{" "}
            {formatDistanceToNow(new Date(pendingRequest.created_at), { addSuffix: true })}.
            An admin will review it soon.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">
                Why do you need Analyst access?{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Briefly describe why you need this access..."
                className="mt-1.5 resize-none"
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!checking && !pendingRequest && (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Submitting…" : "Submit Request"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
