import { Injectable, OnDestroy } from '@angular/core';
import { BotStateService, Stats, Trade, SignalAnalysis } from './bot-state.service';
import { LogService } from './log.service';
import { TokenService } from './token.service';

@Injectable({ providedIn: 'root' })
export class WebsocketService implements OnDestroy {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private wsUrl = 'ws://localhost:3000';

  onBackendStatus?: (text: string, type: string) => void;
  onToast?: (msg: string, type: string) => void;
  onAuthError?: (msg: string) => void;

  constructor(
    private state: BotStateService,
    private log: LogService,
    private token: TokenService
  ) {}

  connect(url?: string) {
    if (url) this.wsUrl = url;

    // Cancel any pending reconnect before doing anything
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }

    // Null out handlers BEFORE closing so onclose does not queue another reconnect
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      this.log.add('Backend connected ✓', 'ok');
      this.onBackendStatus?.('✓ Backend connected — DerivBot Pro ready', 'ok');

      // Auto-connect with saved token
      const saved = this.token.load();
      if (saved) {
        this.state.connStatus.set('connecting');
        this.state.connLabel.set('CONNECTING...');
        this.send({ type: 'CONNECT', token: saved });
        this.log.add('Auto-connecting with saved token...', 'info');
      }
    };

    this.ws.onmessage = (evt) => {
      let msg: any;
      try { msg = JSON.parse(evt.data); } catch (_) { return; }
      this.handleMessage(msg);
    };

    this.ws.onerror = () => {
      this.onBackendStatus?.('✗ Backend not running. Start: node server.js then refresh.', 'err');
      this.log.add('Backend not reachable — run: node server.js', 'err');
    };

    this.ws.onclose = () => {
      this.log.add('Backend disconnected. Retrying in 5s...', 'warn');
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    };
  }

  send(payload: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.log.add('Backend not connected', 'err');
      this.onToast?.('Backend not running! Start: node server.js', 'err');
    }
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case 'FULL_STATE':       this.onFullState(msg.state); break;
      case 'CONN_STATUS':      this.state.connStatus.set(msg.status); this.state.connLabel.set(msg.label); break;
      case 'AUTHORIZED':       this.onAuthorized(msg); break;
      case 'BALANCE_UPDATE':   this.state.balance.set(parseFloat(msg.balance)); if (msg.currency) this.state.currency.set(msg.currency); break;
      case 'PRICE_HISTORY':    this.state.priceHistory.set(msg.prices); break;
      case 'TICK':             this.onTick(msg); break;
      case 'SIGNAL_UPDATE':    this.state.signalAnalysis.set(msg.analysis as SignalAnalysis); break;
      case 'BOT_STATUS':       this.state.botRunning.set(msg.running); break;
      case 'TRADE_OPENED':     this.state.activeTrade.set(msg.trade); this.log.add(`Trade opened: ${msg.trade.direction} | $${msg.trade.stake}`, 'ok'); break;
      case 'CONTRACT_UPDATE':
        if (msg.contract?.profit !== undefined) {
          this.state.activeTradePnl.set(parseFloat(msg.contract.profit));
        }
        break;
      case 'TRADE_CLOSED':     this.onTradeClosed(msg); break;
      case 'EMERGENCY_STOP':   this.state.activeTrade.set(null); this.state.botRunning.set(false); this.onToast?.('Emergency stop executed!', 'err'); break;
      case 'DERIV_ERROR':      {
        const label = msg.message?.includes('Account is disabled')
          ? 'ACCOUNT DISABLED' : 'DERIV AUTH FAILED';
        this.onAuthError?.(msg.message);
        this.state.connStatus.set('error');
        this.state.connLabel.set(label);
        this.state.derivConnected.set(false);
        this.state.isLive.set(false);
        this.log.add(msg.message, 'err');
        this.onToast?.('Deriv auth failed: ' + msg.message, 'err');
        break;
      }
      case 'LOG':              this.log.add(msg.msg, msg.level); break;
    }
  }

  private onFullState(s: any) {
    if (s.authorized) {
      this.state.connStatus.set('live');
      this.state.connLabel.set('LIVE: ' + s.loginid);
      this.state.isLive.set(true);
      this.state.derivConnected.set(true);
    }
    if (s.balance != null) { this.state.balance.set(parseFloat(s.balance)); }
    if (s.currency) this.state.currency.set(s.currency);
    if (s.trades?.length) this.state.trades.set(s.trades);
    if (s.priceHistory?.length) this.state.priceHistory.set(s.priceHistory);
    if (s.currentPrice) this.state.currentPrice.set(s.currentPrice);
    if (s.stats) this.state.updateStats(s.stats);
    if (s.botRunning) this.state.botRunning.set(true);
  }

  private onAuthorized(msg: any) {
    this.state.derivConnected.set(true);
    this.state.connStatus.set('live');
    this.state.connLabel.set('LIVE: ' + msg.loginid);
    this.state.loginid.set(msg.loginid);
    this.state.balance.set(parseFloat(msg.balance));
    this.state.currency.set(msg.currency);
    this.state.isLive.set(true);
    this.log.add(`✓ Authorized: ${msg.loginid} | ${msg.balance} ${msg.currency}`, 'ok');
    this.onToast?.('Connected! Account: ' + msg.loginid, 'ok');
  }

  private onTick(msg: any) {
    this.state.lastPrice.set(this.state.currentPrice());
    this.state.currentPrice.set(msg.price);
    this.state.priceHistory.update(h => {
      const next = [...h, msg.price];
      return next.length > 100 ? next.slice(-100) : next;
    });
  }

  private onTradeClosed(msg: any) {
    const trade = msg.trade as Trade;
    const stats = msg.stats as Stats;
    this.state.closeTrade(trade, stats);
    this.state.pnlHistory.update(h => [...h, stats.pnl]);
    const win = trade.status === 'win';
    this.onToast?.(
      win
        ? `✓ WIN +$${Math.abs(trade.profit!).toFixed(2)}`
        : `✗ LOSS -$${Math.abs(trade.profit!).toFixed(2)}`,
      win ? 'ok' : 'err'
    );
  }

  ngOnDestroy() {
    this.ws?.close();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }
}
