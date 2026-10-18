import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CirclePlay, X } from 'lucide-react';

const TUTORIAL_VIDEO = '/videos/ai-designer-tutorial.mp4';

export default function AITutorial() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-left text-sm font-bold text-[#0b1f3a] transition-colors hover:border-orange-400 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
        >
          <CirclePlay className="h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />
          <span>Watch AI designer tutorial</span>
          <span className="shrink-0 text-xs font-medium text-slate-500">1:14</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10050] bg-slate-950/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[10051] max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-4 text-slate-900 shadow-2xl focus:outline-none sm:p-6">
          <div className="pr-10">
            <Dialog.Title className="text-xl font-bold text-[#0b1f3a] sm:text-2xl">Create your design with AI</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-slate-600">
              Start with a description — uploading images is optional. See how to add a person, then make a change with Edit with AI. You can add logos and products, too.
            </Dialog.Description>
          </div>
          <Dialog.Close className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" aria-label="Close tutorial">
            <X className="h-5 w-5" aria-hidden="true" />
          </Dialog.Close>
          {open && (
            <video
              className="mt-4 aspect-video max-h-[68dvh] w-full rounded-lg bg-black object-contain"
              src={TUTORIAL_VIDEO}
              controls
              autoPlay
              playsInline
              preload="metadata"
              aria-label="AI designer tutorial with captions"
            >
              <a href={TUTORIAL_VIDEO}>Watch the AI designer tutorial</a>
            </video>
          )}
          <p className="mt-3 text-xs text-slate-500">1 minute 14 seconds · Captions included · Close this video to return to your design.</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
