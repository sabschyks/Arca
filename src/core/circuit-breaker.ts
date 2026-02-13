export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;

  constructor(private readonly options: { threshold: number; resetTimeout: number }) {}

  public isOpen(): boolean {
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      // Se passou o tempo de reset, entramos em HALF_OPEN (permitimos uma tentativa)
      if (now - this.lastFailureTime > this.options.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        return false; // Deixa passar (Probe)
      }
      return true; // Bloqueia
    }
    
    // Se está HALF_OPEN ou CLOSED, deixa passar
    return false;
  }

  public recordSuccess(): void {
    // Se teve sucesso, reseta tudo e fecha o circuito
    this.failures = 0;
    this.state = CircuitState.CLOSED;
  }

  public recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.options.threshold) {
      this.state = CircuitState.OPEN;
    }
  }

  // Getter para testes e métricas
  public getState(): CircuitState {
    return this.state;
  }
}