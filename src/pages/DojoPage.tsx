import React from 'react';
import { DojoDashboardSection } from '../components/DojoDashboardSection';
import type { AstroRestorationResponse } from '../components/SpiritLensSection';
import { useRestorationState } from '../utils/restorationContext';

interface DojoPageProps {
  restorationResult?: AstroRestorationResponse | null;
  captureTitle?: string;
}

export const DojoPage: React.FC<DojoPageProps> = (props) => {
  const ctx = useRestorationState();

  return (
    <DojoDashboardSection
      restorationResult={
        props.restorationResult !== undefined ? props.restorationResult : ctx.latestRestoration
      }
      captureTitle={props.captureTitle ?? ctx.latestCaptureTitle}
    />
  );
};

export default DojoPage;
