import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SpiritLensSection, type AstroRestorationResponse } from '../components/SpiritLensSection';
import { useRestorationState } from '../utils/restorationContext';

interface SpiritLensPageProps {
  onNavigateToDojo?: () => void;
  onRestorationComplete?: (result: AstroRestorationResponse, captureTitle: string) => void;
  storageReady?: boolean;
  initialRestoration?: AstroRestorationResponse | null;
  initialCaptureTitle?: string;
}

export const SpiritLensPage: React.FC<SpiritLensPageProps> = (props) => {
  const navigate = useNavigate();
  const ctx = useRestorationState();

  return (
    <SpiritLensSection
      onNavigateToDojo={props.onNavigateToDojo ?? (() => navigate('/dojo'))}
      storageReady={props.storageReady ?? ctx.storageReady}
      initialRestoration={
        props.initialRestoration !== undefined ? props.initialRestoration : ctx.latestRestoration
      }
      initialCaptureTitle={props.initialCaptureTitle ?? ctx.latestCaptureTitle}
      onRestorationComplete={props.onRestorationComplete ?? ctx.handleRestorationComplete}
    />
  );
};

export default SpiritLensPage;
