export class CancelableCompletionRegistry {
  private readonly completions = new Set<() => void>();

  get size() {
    return this.completions.size;
  }

  track(completion: () => void) {
    let active = true;
    const complete = () => {
      if (!active) return;
      active = false;
      this.completions.delete(complete);
      completion();
    };
    this.completions.add(complete);
    return complete;
  }

  completeAll() {
    [...this.completions].forEach((complete) => complete());
  }
}