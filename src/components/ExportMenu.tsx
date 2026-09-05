import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Export control. When `onExcel` is supplied the user picks between PDF and
 * Excel; otherwise it is a single PDF button (SACCO default).
 */
export function ExportMenu({
  onPdf,
  onExcel,
  label = "Export",
  disabled = false,
}: {
  onPdf: () => void;
  onExcel?: () => void;
  label?: string;
  disabled?: boolean;
}) {
  if (!onExcel) {
    return (
      <Button variant="outline" size="sm" onClick={onPdf} disabled={disabled}>
        <Download className="size-4" /> {label} PDF
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="size-4" /> {label}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onPdf()}>Download as PDF</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExcel()}>Download as Excel</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
