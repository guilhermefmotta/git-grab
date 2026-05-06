import { Settings } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open: isOpen, onClose }: Props) {
  const { settings, setSettings } = useAppStore();

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings size={14} />
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Appearance
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-2">Theme</label>
                <div className="flex gap-2">
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSettings({ theme: t })}
                      className={`px-4 py-1.5 text-xs rounded capitalize transition-colors ${
                        settings.theme === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-2">
                  Font size:{" "}
                  <span className="text-foreground font-medium">{settings.fontSize}px</span>
                </label>
                <input
                  type="range"
                  min={12}
                  max={18}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) => setSettings({ fontSize: Number(e.target.value) })}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>12px</span>
                  <span>18px</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Identity Override
            </p>
            <p className="text-[10px] text-muted-foreground mb-3">
              Overrides git config name/email for commits made in this app.
            </p>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Name</label>
                <input
                  type="text"
                  value={settings.userName}
                  onChange={(e) => setSettings({ userName: e.target.value })}
                  placeholder="Your name"
                  className="w-full bg-secondary text-xs text-foreground placeholder:text-muted-foreground rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email</label>
                <input
                  type="email"
                  value={settings.userEmail}
                  onChange={(e) => setSettings({ userEmail: e.target.value })}
                  placeholder="you@example.com"
                  className="w-full bg-secondary text-xs text-foreground placeholder:text-muted-foreground rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
          >
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
