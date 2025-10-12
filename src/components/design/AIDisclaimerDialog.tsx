import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface AIDisclaimerDialogProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const AIDisclaimerDialog: React.FC<AIDisclaimerDialogProps> = ({
  open,
  onAccept,
  onDecline,
}) => {
  const handleAcceptClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAccept();
  };

  const handleDeclineClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDecline();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDecline(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <DialogTitle className="text-xl">AI Image Generation Terms</DialogTitle>
          </div>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-700 font-medium">
            By using this feature, you agree that:
          </p>
          
          <ul className="space-y-3 text-sm text-gray-600">
            <li className="flex gap-2">
              <span className="text-orange-600 font-bold">•</span>
              <span>
                You hold <strong>full responsibility</strong> for ensuring that any generated images do not infringe on third-party rights (including copyrighted or trademarked materials such as characters, logos, or brand names).
              </span>
            </li>
            
            <li className="flex gap-2">
              <span className="text-orange-600 font-bold">•</span>
              <span>
                You grant <strong>Banners on the Fly</strong> a limited right to reproduce the image solely for the purpose of printing and fulfilling your order.
              </span>
            </li>
            
            <li className="flex gap-2">
              <span className="text-orange-600 font-bold">•</span>
              <span>
                You agree to <strong>indemnify and hold harmless</strong> Banners on the Fly and its affiliates from any claims, damages, or liabilities arising from your use of AI-generated content.
              </span>
            </li>
          </ul>
          
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
            <p className="text-sm text-gray-700">
              <strong>⚠️ Important:</strong> If you are unsure whether your generated image infringes on someone else's rights, please consult an attorney or use only original, licensed, or public-domain content.
            </p>
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleDeclineClick}
            className="border-gray-300"
          >
            Decline
          </Button>
          <Button
            onClick={handleAcceptClick}
            className="bg-orange-600 hover:bg-orange-700"
          >
            I Agree & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AIDisclaimerDialog;
