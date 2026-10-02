'use client';
import { BRAND } from '@store/shared';

/** A floating "chat on WhatsApp" button: custom orders raise questions, and shoppers here ask on WhatsApp.
    The message names the page, so the studio knows what it's about. */
export function WhatsAppButton({ about }: { about?: string }) {
  const number = BRAND.whatsapp.replace(/\D/g, '');
  const open = () => {
    const text = about ? `Hi! I have a question about ${about}: ${location.href}` : `Hi! I have a question: ${location.href}`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return (
    <button className="wa-fab" type="button" onClick={open} aria-label="Chat with the studio on WhatsApp">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 2.2a9.7 9.7 0 00-8.4 14.6L2.3 21.7l5-1.3A9.7 9.7 0 1012 2.2zm0 17.7a8 8 0 01-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3a8 8 0 1116.8-4.3A8 8 0 0112 19.9zm4.4-6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.5 6.5 0 01-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 00-.7.3 2.8 2.8 0 00-.9 2.1 4.9 4.9 0 001 2.6 11.2 11.2 0 004.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 001.7-1.2 2.1 2.1 0 00.1-1.2c0-.1-.2-.2-.4-.3z" />
      </svg>
      <span>Chat on WhatsApp</span>
    </button>
  );
}
