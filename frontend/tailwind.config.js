/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      fontSize: {
        // Escala tipográfica TaxiHUB 2.0
        display: ['1.875rem', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.02em' }],
        h1: ['1.5rem', { lineHeight: '1.33', fontWeight: '700', letterSpacing: '-0.015em' }],
        h2: ['1.25rem', { lineHeight: '1.4', fontWeight: '600', letterSpacing: '-0.01em' }],
        h3: ['1.0625rem', { lineHeight: '1.41', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.43' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.38' }],
        label: ['0.75rem', { lineHeight: '1.33', fontWeight: '600', letterSpacing: '0.06em' }],
        caption: ['0.6875rem', { lineHeight: '1.27' }],
        metric: ['1.625rem', { lineHeight: '1.15', fontWeight: '800', letterSpacing: '-0.02em' }],
        num: ['0.8125rem', { lineHeight: '1.38', fontWeight: '500' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      colors: {
        // Paleta TaxiHUB 2.0 (tokens en src/design/tokens.css)
        th: {
          primary: { DEFAULT: 'var(--th-primary)', dark: 'var(--th-primary-dark)', light: 'var(--th-primary-light)' },
          live: 'var(--th-live)',
          success: 'var(--th-success)',
          danger: 'var(--th-danger)',
          warning: 'var(--th-warning)',
          info: 'var(--th-info)',
          purple: 'var(--th-purple)',
          offline: 'var(--th-offline)',
          bg: 'var(--th-bg)',
          surface: { DEFAULT: 'var(--th-surface)', 2: 'var(--th-surface-2)', 3: 'var(--th-surface-3)' },
          text: 'var(--th-text)',
          muted: 'var(--th-muted)',
          border: 'var(--th-border)',
        },
        brand: {
          DEFAULT: 'hsl(var(--brand) / <alpha-value>)',
          bright: 'hsl(var(--brand-bright) / <alpha-value>)',
          strong: 'hsl(var(--brand-strong) / <alpha-value>)',
          contrast: 'hsl(var(--brand-contrast) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'hsl(var(--surface) / <alpha-value>)',
          2: 'hsl(var(--surface-2) / <alpha-value>)',
          3: 'hsl(var(--surface-3) / <alpha-value>)',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        }
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0'
          },
          to: {
            height: 'var(--radix-accordion-content-height)'
          }
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)'
          },
          to: {
            height: '0'
          }
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.8)' }
        },
        'ping-soft': {
          '0%': { transform: 'scale(1)', opacity: '0.7' },
          '100%': { transform: 'scale(2.4)', opacity: '0' }
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 hsl(var(--brand) / 50%)' },
          '100%': { boxShadow: '0 0 0 14px hsl(var(--brand) / 0%)' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s cubic-bezier(0.2, 0, 0, 1)',
        'slide-down': 'slide-down 0.2s cubic-bezier(0.2, 0, 0, 1)',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.2, 0, 0, 1)',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'ping-soft': 'ping-soft 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0, 0, 0.2, 1) infinite'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};