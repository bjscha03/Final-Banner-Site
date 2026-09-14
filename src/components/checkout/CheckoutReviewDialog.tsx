import React from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';

export default function CheckoutReviewDialog({ children }: { children: React.ReactNode }) {
  return <Dialog>
    <DialogTrigger asChild><button type="button" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-[#18448D] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18448D]">Review order</button></DialogTrigger>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0">
      <header className="shrink-0 border-b border-slate-200 p-5 pr-12">
        <DialogTitle>Review your order</DialogTitle>
        <DialogDescription className="mt-1">Check your artwork, change quantities, or edit items before paying.</DialogDescription>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
      <footer className="shrink-0 border-t border-slate-200 bg-white p-4"><DialogClose asChild><button type="button" className="min-h-12 w-full rounded-xl bg-[#0B1F3A] px-4 py-3 font-bold text-white">Back to checkout</button></DialogClose></footer>
    </DialogContent>
  </Dialog>;
}
