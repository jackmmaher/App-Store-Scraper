'use client';

import { ComponentType } from '@/lib/component-library';

interface WireframeComponentRendererProps {
  type: ComponentType;
  props: Record<string, unknown>;
  width: number;
  height: number;
}

export default function WireframeComponentRenderer({
  type,
  props,
  width,
  height,
}: WireframeComponentRendererProps) {
  const baseClasses = 'w-full h-full overflow-hidden';

  switch (type) {
    case 'header':
      return (
        <div className={`${baseClasses} bg-white border-b border-gray-200 flex items-center px-4`}>
          {props.leftAction !== 'none' && (
            <div className="w-6 h-6 flex items-center justify-center text-blue-600">
              {props.leftAction === 'back' && (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              )}
              {props.leftAction === 'menu' && (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
              {props.leftAction === 'close' && (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
          )}
          <span className="flex-1 text-center font-semibold text-gray-900 truncate">
            {String(props.title || 'Title')}
          </span>
          {props.rightAction !== 'none' && (
            <div className="w-6 h-6 flex items-center justify-center text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </div>
          )}
        </div>
      );

    case 'tabBar':
      const tabs = typeof props.tabs === 'string'
        ? (props.tabs as string).split(',').map(t => t.trim())
        : Array.isArray(props.tabs) ? props.tabs : ['Tab 1', 'Tab 2', 'Tab 3'];
      const activeTab = Number(props.activeTab) || 0;
      return (
        <div className={`${baseClasses} bg-white border-t border-gray-200 flex items-center justify-around pt-2 pb-6`}>
          {tabs.map((tab, i) => (
            <div
              key={i}
              className={`flex flex-col items-center ${
                i === activeTab ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <div className="w-6 h-6 bg-current rounded opacity-30" />
              <span className="text-xs mt-1">{String(tab)}</span>
            </div>
          ))}
        </div>
      );

    case 'textBlock':
      const variantClasses: Record<string, string> = {
        h1: 'text-2xl font-bold',
        h2: 'text-xl font-semibold',
        h3: 'text-lg font-medium',
        body: 'text-sm',
        caption: 'text-xs text-gray-500',
      };
      const alignClasses: Record<string, string> = {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right',
      };
      return (
        <div
          className={`${baseClasses} flex items-center text-gray-900 ${
            variantClasses[String(props.variant)] || variantClasses.body
          } ${alignClasses[String(props.align)] || alignClasses.left}`}
        >
          <span className="w-full">{String(props.text || 'Text content')}</span>
        </div>
      );

    case 'image':
      const radiusMap: Record<string, string> = {
        photo: 'rounded-lg',
        illustration: 'rounded-xl',
        icon: 'rounded-full',
        avatar: 'rounded-full',
      };
      return (
        <div
          className={`${baseClasses} bg-gray-200 flex items-center justify-center ${
            radiusMap[String(props.placeholderType)] || 'rounded-lg'
          }`}
        >
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      );

    case 'card':
      return (
        <div className={`${baseClasses} bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex`}>
          {Boolean(props.hasImage) && (
            <div className="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0 mr-3" />
          )}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 truncate">{String(props.title || 'Card Title')}</h4>
            <p className="text-xs text-gray-500 truncate">{String(props.subtitle || 'Subtitle')}</p>
            {Boolean(props.hasAction) && (
              <span className="text-xs text-blue-600 mt-1 block">View →</span>
            )}
          </div>
        </div>
      );

    case 'listItem':
      return (
        <div className={`${baseClasses} bg-white flex items-center px-4 border-b border-gray-100`}>
          {Boolean(props.hasIcon) && (
            <div className="w-10 h-10 bg-gray-200 rounded-lg mr-3 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{String(props.title || 'List item')}</p>
            {Boolean(props.subtitle) && (
              <p className="text-xs text-gray-500 truncate">{String(props.subtitle)}</p>
            )}
          </div>
          {Boolean(props.hasChevron) && (
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      );

    case 'emptyState':
      return (
        <div className={`${baseClasses} flex flex-col items-center justify-center text-center p-4`}>
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-3">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 mb-2">{String(props.message || 'No items yet')}</p>
          {Boolean(props.hasAction) && (
            <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">
              {String(props.actionLabel || 'Get Started')}
            </button>
          )}
        </div>
      );

    case 'button':
      const sizeClasses: Record<string, string> = {
        small: 'px-3 py-1.5 text-sm',
        medium: 'px-4 py-2 text-sm',
        large: 'px-6 py-3 text-base',
      };
      const variantStyles: Record<string, string> = {
        primary: 'bg-blue-600 text-white',
        secondary: 'bg-gray-200 text-gray-900',
        outline: 'bg-transparent border-2 border-blue-600 text-blue-600',
        text: 'bg-transparent text-blue-600',
      };
      return (
        <div className={`${baseClasses} flex items-center justify-center`}>
          <button
            className={`rounded-xl font-medium ${
              sizeClasses[String(props.size)] || sizeClasses.large
            } ${variantStyles[String(props.variant)] || variantStyles.primary} ${
              props.fullWidth ? 'w-full' : ''
            }`}
          >
            {String(props.label || 'Button')}
          </button>
        </div>
      );

    case 'textField':
      return (
        <div className={`${baseClasses} flex flex-col justify-center`}>
          {Boolean(props.label) && (
            <label className="text-xs font-medium text-gray-700 mb-1">{String(props.label)}</label>
          )}
          <div className="flex items-center px-4 py-3 bg-gray-100 rounded-xl border border-gray-200">
            {Boolean(props.hasIcon) && (
              <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
            <span className="text-gray-400">{String(props.placeholder || 'Enter text...')}</span>
          </div>
        </div>
      );

    case 'searchBar':
      return (
        <div className={`${baseClasses} flex items-center px-4 py-2 bg-gray-100 rounded-xl`}>
          <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-gray-400 flex-1">{String(props.placeholder || 'Search...')}</span>
          {Boolean(props.hasFilter) && (
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          )}
        </div>
      );

    case 'toggle':
      return (
        <div className={`${baseClasses} flex items-center justify-between px-4 bg-white`}>
          <span className="text-gray-900">{String(props.label || 'Toggle option')}</span>
          <div className={`w-12 h-7 rounded-full relative ${props.defaultOn ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${props.defaultOn ? 'right-1' : 'left-1'}`} />
          </div>
        </div>
      );

    case 'slider':
      return (
        <div className={`${baseClasses} flex flex-col justify-center px-4`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-900">{String(props.label || 'Value')}</span>
            {Boolean(props.showValue) && <span className="text-sm font-medium text-blue-600">50</span>}
          </div>
          <div className="relative h-2 bg-gray-200 rounded-full">
            <div className="absolute left-0 top-0 h-full w-1/2 bg-blue-600 rounded-full" />
            <div className="absolute top-1/2 -translate-y-1/2 left-1/2 w-5 h-5 bg-white border-2 border-blue-600 rounded-full shadow" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-400">{String(props.min ?? 0)}</span>
            <span className="text-xs text-gray-400">{String(props.max ?? 100)}</span>
          </div>
        </div>
      );

    case 'onboardingSlide':
      return (
        <div className={`${baseClasses} bg-white flex flex-col items-center justify-between py-12 px-6`}>
          {Boolean(props.hasSkip) && (
            <div className="self-end">
              <span className="text-sm text-gray-500">Skip</span>
            </div>
          )}
          <div className="w-40 h-40 bg-gradient-to-br from-blue-100 to-purple-100 rounded-3xl flex items-center justify-center mb-8">
            <svg className="w-20 h-20 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{String(props.title || 'Welcome')}</h2>
            <p className="text-gray-500">{String(props.description || 'Description')}</p>
          </div>
          <div className="flex items-center space-x-2 mt-8">
            <span className="text-sm text-gray-400">{String(props.progress || '1 of 3')}</span>
          </div>
        </div>
      );

    case 'paywallCard':
      const features = typeof props.features === 'string'
        ? (props.features as string).split(',').map(f => f.trim())
        : Array.isArray(props.features) ? props.features : ['Feature 1', 'Feature 2'];
      return (
        <div className={`${baseClasses} bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl p-6 text-white relative`}>
          {Boolean(props.hasClose) && (
            <button className="absolute top-4 right-4 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <h3 className="text-xl font-bold mb-1">{String(props.title || 'Unlock Premium')}</h3>
          <p className="text-white/80 text-sm mb-4">{String(props.price || '$9.99/month')}</p>
          <ul className="space-y-2 mb-6">
            {features.map((f, i) => (
              <li key={i} className="flex items-center text-sm">
                <svg className="w-4 h-4 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {String(f)}
              </li>
            ))}
          </ul>
          <button className="w-full py-3 bg-white text-purple-600 font-semibold rounded-xl">
            {String(props.ctaText || 'Start Free Trial')}
          </button>
        </div>
      );

    case 'cameraView':
      return (
        <div className={`${baseClasses} bg-gray-900 relative flex items-center justify-center`}>
          {/* Camera preview placeholder */}
          <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900" />

          {/* Overlay */}
          {props.overlayType === 'grid' && (
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="border border-white/20" />
              ))}
            </div>
          )}
          {props.overlayType === 'scan_area' && (
            <div className="w-64 h-64 border-2 border-white/60 rounded-lg relative">
              <div className="absolute -top-0.5 -left-0.5 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
              <div className="absolute -top-0.5 -right-0.5 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
              <div className="absolute -bottom-0.5 -left-0.5 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <div className="absolute -bottom-0.5 -right-0.5 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center space-x-8">
            {Boolean(props.hasFlash) && (
              <button className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
            )}
            <button className="w-16 h-16 bg-white rounded-full border-4 border-white/50" />
            {Boolean(props.hasFlip) && (
              <button className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>
        </div>
      );

    case 'resultsCard':
      const secondaryFields = typeof props.secondaryFields === 'string'
        ? (props.secondaryFields as string).split(',').map(f => f.trim())
        : Array.isArray(props.secondaryFields) ? props.secondaryFields : [];
      return (
        <div className={`${baseClasses} bg-white rounded-2xl shadow-lg p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{String(props.title || 'Result')}</h3>
            {Boolean(props.hasShare) && (
              <button className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            )}
          </div>
          <div className="text-center my-6">
            <span className="text-5xl font-bold text-gray-900">{String(props.primaryValue || '0')}</span>
            <span className="text-xl text-gray-500 ml-1">{String(props.primaryUnit || '')}</span>
          </div>
          {secondaryFields.length > 0 && (
            <div className="flex justify-center space-x-4 text-sm text-gray-600">
              {secondaryFields.map((field, i) => (
                <span key={i}>{String(field)}</span>
              ))}
            </div>
          )}
        </div>
      );

    case 'loadingState':
      return (
        <div className={`${baseClasses} flex flex-col items-center justify-center`}>
          {props.animationType === 'spinner' && (
            <svg className="animate-spin w-10 h-10 text-blue-600 mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {props.animationType === 'dots' && (
            <div className="flex space-x-2 mb-3">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-3 h-3 bg-blue-600 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          )}
          {props.animationType === 'progress' && (
            <div className="w-full h-2 bg-gray-200 rounded-full mb-3 overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full w-2/3 animate-pulse" />
            </div>
          )}
          <span className="text-sm text-gray-500">{String(props.message || 'Processing...')}</span>
        </div>
      );

    default:
      return (
        <div className={`${baseClasses} bg-gray-200 flex items-center justify-center rounded-lg`}>
          <span className="text-gray-500 text-sm">Unknown: {type}</span>
        </div>
      );
  }
}
