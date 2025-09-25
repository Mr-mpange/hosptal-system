import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNotifications } from "@/hooks/useNotifications";

const NotificationsBell = () => {
  const { items, reload } = useNotifications(60000);
  const [open, setOpen] = useState(false);
  const count = items.length;

  return (
    <div className="relative">
      <Button variant="outline" onClick={() => { setOpen((v) => !v); if (!open) reload(); }} className="flex items-center gap-2">
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{count}</span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 z-50">
          <Card className="max-h-80 overflow-auto p-2 space-y-2">
            {items.map(n => (
              <div key={n.id} className="p-2 border rounded">
                <p className="font-medium text-sm truncate">{n.title}</p>
                <p className="text-xs text-muted-foreground break-words">{n.message}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</p>
              </div>
            ))}
            {items.length === 0 && (
              <div className="text-sm text-muted-foreground p-2">No notifications</div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default NotificationsBell;
