import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ScreenshotItem {
  label: string;
  src: string;
}

@Component({
  selector: 'app-screenshot-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './screenshot-gallery.component.html',
  styleUrl: './screenshot-gallery.component.css',
})
export class ScreenshotGalleryComponent {
  @Input({ required: true }) screenshots: ScreenshotItem[] = [];

  preview = signal<ScreenshotItem | null>(null);

  open(item: ScreenshotItem): void {
    this.preview.set(item);
  }

  close(): void {
    this.preview.set(null);
  }
}
