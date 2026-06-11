import React, { ComponentType, FC, createContext, useContext, useMemo } from 'react';

import * as themes from './themes';
import { createTheme } from './base';

const DEFAULT_THEME_NAME = 'chromeLight';

/** Name of a bundled preset theme. */
export type ThemeName = keyof typeof themes;

/** A custom theme object: a set of theme variables (see src/styles/themes). */
export type ThemeDefinition = Record<string, string | number>;

/** Accepted values for the `theme` prop: a preset name or a custom theme object. */
export type Theme = ThemeName | ThemeDefinition;

const ThemeContext = createContext(createTheme(themes[DEFAULT_THEME_NAME]));

/**
 * Hook to get the component styles for the current theme.
 * @param {string} baseStylesKey - Name of the component to be styled
 */
export const useStyles = (baseStylesKey: any) => {
  const themeStyles = useContext(ThemeContext);
  return themeStyles[baseStylesKey];
};

/**
 * HOC to create a component that accepts a "theme" prop and uses it to set
 * the current theme. This is intended to be used by the top-level inspector
 * components.
 * @param {Object} WrappedComponent - React component to be wrapped
 */
export const themeAcceptor = <P extends object>(WrappedComponent: ComponentType<P>) => {
  const ThemeAcceptor: FC<Omit<P, 'theme'> & { theme?: Theme }> = ({ theme = DEFAULT_THEME_NAME, ...restProps }) => {
    const themeStyles = useMemo(() => {
      switch (Object.prototype.toString.call(theme)) {
        case '[object String]':
          return createTheme(themes[theme as ThemeName]);
        case '[object Object]':
          return createTheme(theme as ThemeDefinition);
        default:
          return createTheme(themes[DEFAULT_THEME_NAME]);
      }
    }, [theme]);

    return (
      <ThemeContext.Provider value={themeStyles}>
        <WrappedComponent {...(restProps as P)} />
      </ThemeContext.Provider>
    );
  };

  return ThemeAcceptor;
};
