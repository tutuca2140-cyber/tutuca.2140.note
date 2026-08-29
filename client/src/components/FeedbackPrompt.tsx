import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type FeedbackPromptProps = {
  open: boolean;
  onSubmitted: () => void;
};

export default function FeedbackPrompt({ open, onSubmitted }: FeedbackPromptProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const remaining = useMemo(() => 200 - comment.length, [comment.length]);

  const handleSubmit = async () => {
    if (rating < 1) {
      toast.error("Selecione de 1 a 5 estrelas.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "Não foi possível enviar sua avaliação.");
      }

      toast.success("Obrigado! Sua avaliação foi enviada.");
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar avaliação.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Como está sendo sua experiência?</DialogTitle>
          <DialogDescription>
            Sua opinião ajuda o Note Note a evoluir. Avalie de 1 a 5 estrelas e, se quiser, deixe uma sugestão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div>
            <p className="mb-2 text-sm font-medium">Sua avaliação</p>
            <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
              {[1, 2, 3, 4, 5].map(star => {
                const active = star <= (hovered || rating);
                return (
                  <button
                    key={star}
                    type="button"
                    className="rounded-md p-1.5 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
                    onMouseEnter={() => setHovered(star)}
                    onClick={() => setRating(star)}
                  >
                    <Star
                      className={`h-8 w-8 ${active ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="feedback-comment" className="text-sm font-medium">
                Comentário ou sugestão
              </label>
              <span className="text-xs text-muted-foreground">{remaining} restantes</span>
            </div>
            <Textarea
              id="feedback-comment"
              value={comment}
              onChange={event => setComment(event.target.value.slice(0, 200))}
              maxLength={200}
              rows={4}
              placeholder="Conte o que gostou ou o que podemos melhorar..."
            />
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={submitting || rating < 1}>
            {submitting ? "Enviando..." : "Enviar avaliação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
