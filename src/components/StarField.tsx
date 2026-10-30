import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  z: number; // Depth factor: 1 (far), 2 (mid), 3 (near/foreground)
  radius: number;
  color: string;
  twinklePhase: number;
  twinkleSpeed: number;
  baseAlpha: number;
  spikeLength?: number;
}

interface StarFieldProps {
  className?: string;
  starCount?: number;
}

export const StarField: React.FC<StarFieldProps> = ({
  className = '',
  starCount = 320,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    // Mouse coordinates and smoothed parallax offset values
    const mouse = {
      targetX: 0,
      targetY: 0,
      currentX: 0,
      currentY: 0,
    };

    // Event listener that tracks mouse position
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      // Normalized offset from center: -1.0 to +1.0
      mouse.targetX = (clientX - width / 2) / (width / 2);
      mouse.targetY = (clientY - height / 2) / (height / 2);
    };

    // Support touch position on mobile
    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches[0].clientX - rect.left;
      const clientY = e.touches[0].clientY - rect.top;

      mouse.targetX = (clientX - width / 2) / (width / 2);
      mouse.targetY = (clientY - height / 2) / (height / 2);
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
      generateStars();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('resize', handleResize);

    // Procedural Stars Generation
    let stars: Star[] = [];
    const starPalette = [
      '#F4EFE3', // moonlight off-white
      '#FFFFFF', // pure crystalline white
      '#D4A84B', // celestial warm gold
      '#B2CEFF', // blue-white stellar glow
      '#FFC2B4', // red giant ember
    ];

    const generateStars = () => {
      stars = [];
      const count = Math.min(starCount, Math.floor((width * height) / 3000));

      for (let i = 0; i < count; i++) {
        // Distribute depth: majority distant (z=1), some mid (z=2), few prominent (z=3)
        const rand = Math.random();
        const depth = rand < 0.65 ? 1 : rand < 0.9 ? 2 : 3;

        const size =
          depth === 1
            ? Math.random() * 0.9 + 0.4
            : depth === 2
            ? Math.random() * 1.4 + 0.8
            : Math.random() * 2.0 + 1.2;

        const hasSpikes = depth === 3 && Math.random() > 0.4;

        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z: depth,
          radius: size,
          color: starPalette[Math.floor(Math.random() * starPalette.length)],
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: Math.random() * 0.03 + 0.015,
          baseAlpha: depth === 1 ? 0.5 : depth === 2 ? 0.75 : 0.95,
          spikeLength: hasSpikes ? size * 4.5 : undefined,
        });
      }
    };

    generateStars();

    // Procedural Shooting Star / Meteor Event
    interface MeteorTrail {
      x: number;
      y: number;
      length: number;
      speed: number;
      angle: number;
      alpha: number;
      active: boolean;
    }

    let meteor: MeteorTrail = {
      x: 0,
      y: 0,
      length: 0,
      speed: 0,
      angle: Math.PI / 4,
      alpha: 0,
      active: false,
    };

    let lastMeteorSpawn = Date.now();

    const spawnMeteor = () => {
      meteor = {
        x: Math.random() * width * 0.8 + width * 0.1,
        y: Math.random() * (height * 0.4),
        length: Math.random() * 80 + 60,
        speed: Math.random() * 12 + 10,
        angle: Math.PI / 4 + (Math.random() * 0.15 - 0.075),
        alpha: 1,
        active: true,
      };
    };

    // Render Loop
    let time = 0;
    const render = () => {
      time += 0.02;

      // Smooth dampening / lerp for organic cursor tracking
      mouse.currentX += (mouse.targetX - mouse.currentX) * 0.05;
      mouse.currentY += (mouse.targetY - mouse.currentY) * 0.05;

      ctx.clearRect(0, 0, width, height);

      // Render Procedural Stars with Parallax Offset
      stars.forEach((star) => {
        // Depth-based parallax offset: deeper stars shift further, creating 3D depth perception
        const parallaxOffset = star.z === 1 ? 12 : star.z === 2 ? 26 : 44;
        const targetX = star.x + mouse.currentX * parallaxOffset;
        const targetY = star.y + mouse.currentY * parallaxOffset;

        // Wrap around boundaries seamlessly
        const drawX = ((targetX % width) + width) % width;
        const drawY = ((targetY % height) + height) % height;

        // Twinkle luminance calculation
        const twinkle = Math.sin(time * star.twinkleSpeed * 60 + star.twinklePhase);
        const dynamicAlpha = Math.max(0.15, star.baseAlpha + twinkle * 0.25);

        ctx.save();
        ctx.globalAlpha = dynamicAlpha;
        ctx.fillStyle = star.color;

        // Star core
        ctx.beginPath();
        ctx.arc(drawX, drawY, star.radius, 0, Math.PI * 2);
        ctx.fill();

        // Foreground stars halo & diffraction spikes
        if (star.z === 3) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, star.radius * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = star.color;
          ctx.globalAlpha = dynamicAlpha * 0.15;
          ctx.fill();

          if (star.spikeLength) {
            ctx.strokeStyle = star.color;
            ctx.lineWidth = 0.8;
            ctx.globalAlpha = dynamicAlpha * 0.55;

            ctx.beginPath();
            ctx.moveTo(drawX - star.spikeLength, drawY);
            ctx.lineTo(drawX + star.spikeLength, drawY);
            ctx.moveTo(drawX, drawY - star.spikeLength);
            ctx.lineTo(drawX, drawY + star.spikeLength);
            ctx.stroke();
          }
        }

        ctx.restore();
      });

      // Periodic Shooting Star / Meteor logic
      const now = Date.now();
      if (!meteor.active && now - lastMeteorSpawn > 5000) {
        if (Math.random() < 0.035) {
          spawnMeteor();
          lastMeteorSpawn = now;
        }
      }

      if (meteor.active) {
        meteor.x += Math.cos(meteor.angle) * meteor.speed;
        meteor.y += Math.sin(meteor.angle) * meteor.speed;
        meteor.alpha -= 0.018;

        if (meteor.alpha <= 0 || meteor.x > width + 100 || meteor.y > height + 100) {
          meteor.active = false;
        } else {
          ctx.save();
          ctx.globalAlpha = meteor.alpha;

          const tailX = meteor.x - Math.cos(meteor.angle) * meteor.length;
          const tailY = meteor.y - Math.sin(meteor.angle) * meteor.length;

          const gradient = ctx.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
          gradient.addColorStop(0, 'rgba(212, 168, 75, 0)');
          gradient.addColorStop(0.75, 'rgba(212, 168, 75, 0.45)');
          gradient.addColorStop(1, '#F4EFE3');

          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(meteor.x, meteor.y);
          ctx.stroke();

          // Leading bright meteor head
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(meteor.x, meteor.y, 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [starCount]);

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden z-10 ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
