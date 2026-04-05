"use client";

import { Traveller } from "@/lib/booking-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TravellerFormProps {
  traveller: Traveller;
  index: number;
  onUpdate: (id: string, updates: Partial<Traveller>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

export function TravellerForm({ traveller, index, onUpdate, onRemove, canRemove }: TravellerFormProps) {
  const handleToggleSelf = (checked: boolean) => {
    if (checked) {
      onUpdate(traveller.id, { isSelf: true, name: "Current User", age: 28 });
      return;
    }

    onUpdate(traveller.id, { isSelf: false, name: "", age: "" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Traveller {index + 1}</CardTitle>
        </div>
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(traveller.id)} className="text-destructive hover:text-destructive">
            Remove
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6">
        {index === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Checkbox id={`self-${traveller.id}`} checked={traveller.isSelf} onCheckedChange={handleToggleSelf} />
            <Label htmlFor={`self-${traveller.id}`} className="text-sm font-normal">
              I am this traveller (fill with my info)
            </Label>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`name-${traveller.id}`}>Full name</Label>
            <Input
              id={`name-${traveller.id}`}
              value={traveller.name}
              onChange={(event) => onUpdate(traveller.id, { name: event.target.value })}
              placeholder="e.g. John Doe"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`age-${traveller.id}`}>Age</Label>
            <Input
              id={`age-${traveller.id}`}
              type="number"
              value={traveller.age}
              onChange={(event) => onUpdate(traveller.id, { age: event.target.value })}
              placeholder="e.g. 25"
              required
              min="18"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
