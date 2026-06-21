import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { RouterLink } from '@angular/router';

import { LoadingComponent } from '../loading/loading.component';

import { ErrorMessageComponent } from '../error-message/error-message.component';

import { PageInspectorService } from '../../services/page-inspector.service';

import {

  InspectedElement,

  InspectorViewport,

  PageInspectionResult,

  PreviewLoadPhase,

  isPreviewUsable,

  previewStatusLabel,

} from '../../models/page-inspector.model';

import { FlowStepAction, supportsElementPicker } from '../../utils/flow-templates';

import {

  ELEMENT_GUIDE_FILTERS,

  ElementGuideFilter,

  categoryLabel,

  filterGuidedElements,

  importanceBadgeClass,

  suggestedActionsLabel,

} from '../../utils/element-guide.util';



@Component({

  selector: 'app-page-preview-picker',

  standalone: true,

  imports: [CommonModule, FormsModule, RouterLink, LoadingComponent, ErrorMessageComponent],

  templateUrl: './page-preview-picker.component.html',

  styleUrl: './page-preview-picker.component.css',

})

export class PagePreviewPickerComponent implements OnInit, OnDestroy, OnChanges {

  @Input() url = '';

  @Input() activeStepAction: FlowStepAction | null = null;

  @Input() pickingEnabled = false;

  @Input() forcePickEnabled = false;

  @Input() externalInspection: PageInspectionResult | null = null;

  @Input() highlightElementIds: string[] = [];

  @Input() showControls = true;

  @Input() compactHeader = false;

  @Input() guidedMode = true;



  @Output() elementSelected = new EventEmitter<InspectedElement>();

  @Output() inspectionLoaded = new EventEmitter<PageInspectionResult>();

  @Output() continueManually = new EventEmitter<void>();



  private readonly inspector = inject(PageInspectorService);

  private loadMessageTimer: ReturnType<typeof setInterval> | null = null;

  private loadStartedAt = 0;



  viewport: InspectorViewport = 'desktop';

  loading = false;

  loadingMessage = 'Loading page…';

  error: string | null = null;

  apiUnavailable = false;

  inspection: PageInspectionResult | null = null;

  hoveredElementId: string | null = null;

  selectedElementId: string | null = null;

  focusedElementId: string | null = null;

  activeFilter: ElementGuideFilter = 'important';

  showDeveloperDetails = false;



  scaleX = 1;

  scaleY = 1;



  guideFilters = ELEMENT_GUIDE_FILTERS;



  get displayInspection(): PageInspectionResult | null {

    return this.externalInspection || this.inspection;

  }



  get screenshotSrc(): string | null {

    return this.inspector.screenshotUrl(this.displayInspection?.screenshotPath);

  }



  get previewPhase(): PreviewLoadPhase {

    if (this.loading && !this.externalInspection) {

      const elapsed = Date.now() - this.loadStartedAt;

      if (elapsed < 2500) return 'loading';

      if (elapsed < 8000) return 'waiting';

      return 'detecting';

    }

    if (!this.displayInspection) return 'idle';

    if (this.displayInspection.status === 'ok') return 'ready';

    return this.displayInspection.status;

  }



  get statusLabel(): string {

    return previewStatusLabel(this.displayInspection, this.loading && !this.externalInspection);

  }



  get previewUsable(): boolean {

    return isPreviewUsable(this.displayInspection);

  }



  get canPick(): boolean {

    if (!this.previewUsable) return false;

    if (this.forcePickEnabled && this.pickingEnabled) return true;

    return Boolean(this.pickingEnabled && this.activeStepAction && supportsElementPicker(this.activeStepAction));

  }



  get showBlockedActions(): boolean {

    const status = this.displayInspection?.status;

    return status === 'blocked' || status === 'timeout';

  }



  get showLowContentHint(): boolean {

    const inspection = this.displayInspection;

    if (!inspection || (this.loading && !this.externalInspection)) return false;

    if (inspection.status === 'blocked' || inspection.status === 'timeout') return false;

    return inspection.elements.length < 3 || inspection.status === 'partial';

  }



  get showGuidedPanel(): boolean {

    return this.guidedMode && Boolean(this.displayInspection?.elements.length) && Boolean(this.screenshotSrc);

  }



  get guidedElements(): InspectedElement[] {

    const elements = this.displayInspection?.elements || [];

    return filterGuidedElements(elements, this.activeFilter);

  }



  get focusedElement(): InspectedElement | null {

    const id = this.focusedElementId || this.selectedElementId || this.hoveredElementId;

    if (!id) return this.guidedElements[0] || null;

    return this.displayInspection?.elements.find((element) => element.id === id) || null;

  }



  ngOnChanges(changes: SimpleChanges): void {

    if (changes['externalInspection'] && this.externalInspection) {

      this.error = null;

      this.focusTopImportantElement();

    }

  }



  ngOnInit(): void {

    this.inspector.isPageInspectorAvailable().subscribe((available) => {

      this.apiUnavailable = !available;

      if (!available) {

        this.error =

          'Page preview is unavailable. Restart the backend with `npm run dev:backend` so the latest API is running on port 3000.';

      }

    });

  }



  ngOnDestroy(): void {

    this.stopLoadMessageTimer();

  }



  loadPreview(): void {

    const trimmed = this.url.trim();

    if (!trimmed) {

      this.error = 'Enter a website URL first.';

      return;

    }



    if (this.apiUnavailable) {

      this.error =

        'Page preview is unavailable. Restart the backend with `npm run dev:backend` so the latest API is running on port 3000.';

      return;

    }



    this.loading = true;

    this.error = null;

    this.inspection = null;

    this.hoveredElementId = null;

    this.selectedElementId = null;

    this.focusedElementId = null;

    this.loadStartedAt = Date.now();

    this.startLoadMessageTimer();



    this.inspector.inspectPage({ url: trimmed, viewport: this.viewport }).subscribe({

      next: (result) => {

        this.inspection = result;

        this.loading = false;

        this.stopLoadMessageTimer();

        this.focusTopImportantElement();

        this.inspectionLoaded.emit(result);

      },

      error: (err) => {

        this.loading = false;

        this.stopLoadMessageTimer();

        if (err.status === 404 && err.error?.error === 'Route not found.') {

          this.apiUnavailable = true;

          this.error =

            'Page preview API was not found. Restart the backend with `npm run dev:backend` to load the latest version.';

          return;

        }

        this.error = err.error?.error || 'Failed to load page preview.';

      },

    });

  }



  retryMobile(): void {

    this.viewport = 'mobile';

    this.loadPreview();

  }



  retryDesktop(): void {

    this.viewport = 'desktop';

    this.loadPreview();

  }



  setFilter(filter: ElementGuideFilter): void {

    this.activeFilter = filter;

    this.focusTopImportantElement();

  }



  onImageLoad(event: Event): void {

    const img = event.target as HTMLImageElement;

    if (!this.displayInspection?.viewport) return;



    const naturalWidth = img.naturalWidth || this.displayInspection.viewport.width;

    const naturalHeight = img.naturalHeight || this.displayInspection.viewport.height;

    this.scaleX = img.clientWidth / naturalWidth;

    this.scaleY = img.clientHeight / naturalHeight;

  }



  overlayStyle(element: InspectedElement): Record<string, string> {

    const box = element.boundingBox;

    return {

      left: `${box.x * this.scaleX}px`,

      top: `${box.y * this.scaleY}px`,

      width: `${box.width * this.scaleX}px`,

      height: `${box.height * this.scaleY}px`,

    };

  }



  onHover(element: InspectedElement | null): void {

    this.hoveredElementId = element?.id || null;

  }



  onListFocus(element: InspectedElement): void {

    this.focusedElementId = element.id;

    this.hoveredElementId = element.id;

  }



  onListSelect(element: InspectedElement): void {

    this.focusedElementId = element.id;

    this.selectedElementId = element.id;

    if (this.canPick) {

      this.elementSelected.emit(element);

    }

  }



  onSelect(element: InspectedElement, event: Event): void {

    event.stopPropagation();

    this.focusedElementId = element.id;

    this.selectedElementId = element.id;

    if (!this.canPick) return;

    this.elementSelected.emit(element);

  }



  get showOverlays(): boolean {

    if (!this.displayInspection || !this.screenshotSrc) return false;

    if (this.previewUsable) return true;

    return this.highlightElementIds.length > 0;

  }



  isHighlighted(element: InspectedElement): boolean {

    return (

      this.highlightElementIds.includes(element.id) ||

      this.focusedElementId === element.id ||

      this.selectedElementId === element.id

    );

  }



  isSelected(element: InspectedElement): boolean {

    return this.selectedElementId === element.id;

  }



  isHovered(element: InspectedElement): boolean {

    return this.hoveredElementId === element.id;

  }



  isFocused(element: InspectedElement): boolean {

    return this.focusedElementId === element.id;

  }



  statusClass(): string {

    return `status-${this.previewPhase}`;

  }



  categoryLabel(element: InspectedElement): string {

    return categoryLabel(element.category);

  }



  importanceClass(element: InspectedElement): string {

    return importanceBadgeClass(element.importance);

  }



  actionsLabel(element: InspectedElement): string {

    return suggestedActionsLabel(element.suggestedActions);

  }



  displayLabel(element: InspectedElement): string {

    return element.humanLabel || element.label;

  }



  private focusTopImportantElement(): void {

    const top = filterGuidedElements(this.displayInspection?.elements || [], 'important')[0];

    this.focusedElementId = top?.id || this.guidedElements[0]?.id || null;

  }



  private startLoadMessageTimer(): void {

    this.stopLoadMessageTimer();

    this.loadingMessage = 'Loading page…';

    this.loadMessageTimer = setInterval(() => {

      const elapsed = Date.now() - this.loadStartedAt;

      if (elapsed < 2500) {

        this.loadingMessage = 'Loading page…';

      } else if (elapsed < 8000) {

        this.loadingMessage = 'Waiting for content…';

      } else {

        this.loadingMessage = 'Detecting and classifying elements…';

      }

    }, 500);

  }



  private stopLoadMessageTimer(): void {

    if (this.loadMessageTimer) {

      clearInterval(this.loadMessageTimer);

      this.loadMessageTimer = null;

    }

  }

}


