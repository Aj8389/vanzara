import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopbarComponent } from './components/topbar/topbar.component';
import { LeftPanelComponent } from './components/left-panel/left-panel.component';
import { CenterComponent } from './components/center/center.component';
import { RightPanelComponent } from './components/right-panel/right-panel.component';
import { WebsocketService } from './services/websocket.service';
import { LogService } from './services/log.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    TopbarComponent,
    LeftPanelComponent,
    CenterComponent,
    RightPanelComponent
  ],
  template: `
    <app-topbar></app-topbar>
    <div class="workspace">
      <app-left-panel></app-left-panel>
      <app-center></app-center>
      <app-right-panel></app-right-panel>
    </div>

    <!-- Toast Notification -->
    <div class="toast" [class]="'toast ' + toastType() + (toastVisible() ? ' show' : '')">
      {{ toastMsg() }}
    </div>

    <!-- Backend Status Bar -->
    <div class="backend-bar" [class]="'backend-bar ' + backendType()">
      {{ backendText() }}
    </div>
  `
})
export class AppComponent implements OnInit {
  toastMsg = signal('');
  toastType = signal('ok');
  toastVisible = signal(false);
  private toastTimer: any;

  backendText = signal('⚠ Connecting to backend WebSocket...');
  backendType = signal('info');

  constructor(
    private ws: WebsocketService,
    private log: LogService
  ) {}

  ngOnInit() {
    this.ws.onToast = (msg: string, type: string) => this.showToast(msg, type);
    this.ws.onBackendStatus = (text: string, type: string) => {
      this.backendText.set(text);
      this.backendType.set(type);
    };

    // Auto-detect backend URL:
    // When served via server.js (prod): same host + port
    // When using ng serve (dev on :4200): point to localhost:3000
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.hostname;
    const port = location.port === '4200' ? '3000' : (location.port || '3000');
    const wsUrl = `${protocol}//${host}:${port}`;

    this.log.add(`Connecting to backend: ${wsUrl}`, 'info');
    this.ws.connect(wsUrl);
  }

  showToast(msg: string, type = 'ok') {
    this.toastMsg.set(msg);
    this.toastType.set(type);
    this.toastVisible.set(true);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastVisible.set(false), 3500);
  }
}
