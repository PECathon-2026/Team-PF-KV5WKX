import React, { useEffect, useRef } from 'react';

interface Petal {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  opacity: number;
  oscillation: number;
  oscillationSpeed: number;
}

export const FallingLeaves: React.FC<{ density?: number }> = ({ density = 24 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const petalColors = [
      '#FFDFE5', // soft moonlight sakura pink
      '#FCD1D7', // blushing cherry petal
      '#F4EFE3', // moonlight ivory
      '#ECA5AD', // deep blossom edge
      '#D4A84B', // subtle golden starlight shimmer
    ];

    const petals: Petal[] = Array.from({ length: density }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height - height,
      size: Math.random() * 8 + 8,
      speedY: Math.random() * 1.0 + 0.6,
      speedX: Math.random() * 0.7 + 0.2,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 1.4,
      color: petalColors[Math.floor(Math.random() * petalColors.length)],
      opacity: Math.random() * 0.45 + 0.35,
      oscillation: Math.random() * Math.PI * 2,
      oscillationSpeed: Math.random() * 0.025 + 0.012,
    }));

    // Draw Japanese Cherry Blossom Petal (Sakura)
    const drawSakuraPetal = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      size: number,
      rotation: number,
      color: string,
      opacity: number
    ) => {
      context.save();
      context.translate(x, y);
      context.rotate((rotation * Math.PI) / 180);
      context.globalAlpha = opacity;
      context.fillStyle = color;

      // Organic curved petal with heart-notch tip
      context.beginPath();
      context.moveTo(0, size * 0.9);
      context.bezierCurveTo(-size * 0.8, size * 0.3, -size * 0.9, -size * 0.5, -size * 0.3, -size);
      // Notch at petal tip
      context.lineTo(0, -size * 0.7);
      context.lineTo(size * 0.3, -size);
      context.bezierCurveTo(size * 0.9, -size * 0.5, size * 0.8, size * 0.3, 0, size * 0.9);
      context.closePath();
      context.fill();

      // Soft starlight gradient highlight
      context.strokeStyle = 'rgba(212, 168, 75, 0.25)';
      context.lineWidth = 0.5;
      context.stroke();

      context.restore();
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      petals.forEach((petal) => {
        petal.oscillation += petal.oscillationSpeed;
        petal.x += Math.sin(petal.oscillation) * 1.1 + petal.speedX;
        petal.y += petal.speedY;
        petal.rotation += petal.rotationSpeed;

        if (petal.y > height + 20) {
          petal.y = -20;
          petal.x = Math.random() * width;
        }
        if (petal.x > width + 20) {
          petal.x = -20;
        }

        drawSakuraPetal(
          ctx,
          petal.x,
          petal.y,
          petal.size,
          petal.rotation,
          petal.color,
          petal.opacity
        );
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-30"
      style={{ opacity: 0.9 }}
    />
  );
};
