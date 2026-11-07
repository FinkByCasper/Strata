import React from 'react';
import { useStore } from './store';
import { Button } from '@/components/ui/button';

// If drawing the diagram ever fails, the rest of the app stays up and says so, instead of the whole page going blank.
export class SceneBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error) { console.error('The diagram could not be drawn:', error); }

  render() {
    if (!this.state.error) return this.props.children;
    const { readOnly } = useStore.getState();
    const retry = () => this.setState({ error: null });
    return (
      <div className="grid h-full place-content-center gap-3 p-6 text-center">
        <h2 className="text-lg font-semibold">The diagram could not be drawn</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{readOnly ? 'Try again, or reload the page.' : 'The last change may have caused it. Undoing it usually brings the diagram back.'}</p>
        <div className="flex justify-center gap-2">
          {!readOnly && <Button onClick={() => { useStore.getState().undo(); retry(); }}>Undo last change</Button>}
          <Button variant="outline" onClick={retry}>Try again</Button>
        </div>
      </div>
    );
  }
}
