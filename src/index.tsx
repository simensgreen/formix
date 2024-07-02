import { z } from "zod"
import { createContext, createSignal, useContext, type JSXElement } from "solid-js"

type UndoRedoState<T> = {
  history: T[];
  currentIndex: number;
};

function createUndoRedoManager<T>(initialState: T, maxHistorySize: number = 350) {
  let state: UndoRedoState<T> = {
    history: [initialState],
    currentIndex: 0,
  };

  const setState = (newState: T) => {
    state = {
      history: [
        ...state.history.slice(0, state.currentIndex + 1),
        newState
      ].slice(-maxHistorySize),
      currentIndex: Math.min(state.currentIndex + 1, maxHistorySize - 1),
    };
  };

  const undo = (steps: number = 1): T => {
    state.currentIndex = Math.max(0, state.currentIndex - steps);
    return state.history[state.currentIndex]!;
  };

  const redo = (steps: number = 1): T => {
    state.currentIndex = Math.min(state.history.length - 1, state.currentIndex + steps);
    return state.history[state.currentIndex]!;
  };

  const canUndo = (steps: number = 1): boolean => state.currentIndex >= steps;
  const canRedo = (steps: number = 1): boolean => state.currentIndex + steps < state.history.length;
  const getCurrentState = (): T => state.history[state.currentIndex]!;

  return { setState, undo, redo, canUndo, canRedo, getCurrentState };
}

function get<T = any>(obj: any, path: string): T {
  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (Array.isArray(result) && /^\d+$/.test(key)) {
      result = result[parseInt(key, 10)];
    } else {
      result = result[key];
    }
  }

  return result;
}

function set(obj: any, path: string, value: any): any {
  if (path === '') {
    return obj;
  }

  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((acc, key) => acc[key], obj);
  target[lastKey] = value;
  return obj;
}

export type Update<T> = T | ((prev: T) => T) | ((prev: T) => Promise<T>)
export type SyncUpdate<T> = T | ((prev: T) => T)

export async function getUpdatedValue <T>(prev: T, update: Update<T>): Promise<T> {
  if (update instanceof Function) {
    const result = update(prev);
    return result instanceof Promise ? await result : result;
  }
  return update;
}

export async function getInitialState <T>(init: Initializer<T>): Promise<T> {
  if (init instanceof Function) {
    const result = init();
    return result instanceof Promise ? await result : result;
  }
  return init;
}

export type Initializer<T> = T | (() => T) | (() => Promise<T>) 

export type FieldMetaState = {
  touched: boolean
  dirty: boolean
  loading: boolean
  disabled: boolean
  readOnly: boolean
}

export type FieldStatus = {
  isSettingValue: boolean;
  isSettingMeta: boolean;
}

export const defaultFieldMetaState: FieldMetaState = {
  dirty: false,
  loading: false,
  touched: false,
  disabled: false,
  readOnly: false,
}

export type FieldState<T> = { 
  value: T,
  setValue: (update: Update<T>) => Promise<void>,
  meta: FieldMetaState
  setMeta: (update: Update<FieldMetaState>) => Promise<void>,
  errors: string[]
  reset: () => Promise<void>
}

export type FormErrors = {
  fieldErrors: {
    [x: string]: string[] | undefined;
    [x: number]: string[] | undefined;
    [x: symbol]: string[] | undefined;
  }
  formErrors: string[]
}

export type FormStatus = {
  initializing: boolean;
  submitting: boolean;
  validating: boolean;
  settingState: boolean;
  settingMeta: boolean;
};

export type FormContext<State = any> = {
  initialState: () => State
  state: () => State
  setState: (update: Update<State>) => Promise<void>
  fieldMetas: () => Record<string, FieldMetaState>
  setFieldMetas: (update: Update<Record<string, FieldMetaState>>) => Promise<void>
  errors: () => FormErrors,
  reset: () => Promise<void>
  submit: () => Promise<void>
  formStatus: () => FormStatus
  fieldStatuses: () => Record<string, FieldStatus>
  undo: (steps?: number) => Promise<void>
  redo: (steps?: number) => Promise<void>
  canUndo: (steps?: number) => boolean
  canRedo: (steps?: number) => boolean
}

type FieldStatusesContext = {
  fieldStatuses: () => Record<string, FieldStatus>
  setFieldStatuses: (update: SyncUpdate<Record<string, FieldStatus>>) => void
}

const formContext = createContext<FormContext>()
const fieldStatusesContext = createContext<FieldStatusesContext>(undefined)

export type FormProps<
  Schema extends z.ZodTypeAny, 
  State extends z.infer<Schema>
> = {
  schema: Schema
  initialState: Initializer<State> 
  onSubmit: <T>(state: State) => T | Promise<T>,
  children: JSXElement
}

export function Form<
  Schema extends z.ZodTypeAny,
  State extends z.infer<Schema>
>(props: FormProps<Schema, State>) {
  const [state, setStateInternal] = createSignal<State | undefined>(undefined)
  const [fieldMetas, setFieldMetasInternal] = createSignal<Record<string, FieldMetaState>>({})
  const [undoRedoManager, setUndoRedoManager] = createSignal<ReturnType<typeof createUndoRedoManager<State>> | undefined>(undefined)

  const [errors, setErrors] = createSignal<FormErrors>({
    fieldErrors: {},
    formErrors: []
  })

  const [formStatus, setFormStatus] = createSignal<FormStatus>({
    initializing: false,
    submitting: false,
    validating: false,
    settingState: false,
    settingMeta: false,
  });

  const [fieldStatuses, setFieldStatuses] = createSignal<Record<string, FieldStatus>>({});

  const revalidate = async () => {
    setFormStatus(prev => ({ ...prev, validating: true }))
    const validationResult = await props.schema.safeParseAsync(state())
    setFormStatus(prev => ({ ...prev, validating: false }))
    return validationResult
  }

  let initialState: State
  const initializeState = async () => {
    setFormStatus(prev => ({ ...prev, initializing: true }))
    try {
      initialState = await getInitialState(props.initialState)
      setStateInternal(initialState)
      setUndoRedoManager(createUndoRedoManager<State>(initialState))
      
      const validationResult = await revalidate()
      if(!validationResult.success) {
        setErrors(validationResult.error.flatten())
      }
    } finally {
      setFormStatus(prev => ({ ...prev, initializing: false }))
    }
  }
  initializeState()

  const setState = async (update: Update<State>) => {
    const currentState = state();
    if (currentState === undefined && update instanceof Function) {
      throw new Error("@gapu/formix: Cannot call 'setState' with an update callback if the state is not initialized yet");
    }
    try {
      setFormStatus(prev => ({ ...prev, isSettingState: true }))
      const next = await getUpdatedValue(currentState as State, update);
      setStateInternal(next)
      undoRedoManager()?.setState(next);

      const validationResult = await revalidate()
      if(!validationResult.success) {
        setErrors(validationResult.error.flatten())
      }
    } finally {
      setFormStatus(prev => ({ ...prev, isSettingState: false }))
    }
  }

  const setFieldMetas = async (update: Update<Record<string, FieldMetaState>>) => {
    try {
      setFormStatus(prev => ({ ...prev, isSettingMeta: true }))
      const next = await getUpdatedValue(fieldMetas(), update)
      setFieldMetasInternal(next)
    } finally {
      setFormStatus(prev => ({ ...prev, isSettingMeta: false }))
    }
  }


  const _initialState = () => initialState

  const submit = async () => {
    const validationResult = await revalidate()
    if(!validationResult.success) return

    try {
      setFormStatus(prev => ({ ...prev, submitting: true }))
      await props.onSubmit(validationResult.data)
    } finally {
      setFormStatus(prev => ({ ...prev, submitting: false }))
    }
  }

  const undo = async (steps: number = 1) => {
    const manager = undoRedoManager()
    if (manager) {
      const previousState = manager.undo(steps);
      await setState(previousState);
    }
  }

  const redo = async (steps: number = 1) => {
    const manager = undoRedoManager()
    if (manager) {
      const nextState = manager.redo(steps);
      await setState(nextState);
    }
  }

  const canUndo = (steps: number = 1) => undoRedoManager()?.canUndo(steps) ?? false;
  const canRedo = (steps: number = 1) => undoRedoManager()?.canRedo(steps) ?? false;

  const reset = async () => {
    const initialState = await getInitialState(props.initialState)
    await setState(initialState);
    undoRedoManager()?.setState(initialState);
  }

  return (
    <formContext.Provider value={{
      initialState: _initialState,
      state,
      setState,
      formStatus,
      fieldStatuses,
      fieldMetas,
      setFieldMetas,
      errors,
      reset,
      submit,
      undo,
      redo,
      canUndo,
      canRedo
    }}>
      <fieldStatusesContext.Provider value={{
        fieldStatuses,
        setFieldStatuses
      }}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          await submit();
        }}>
          {props.children}
        </form>
      </fieldStatusesContext.Provider>
    </formContext.Provider>
  )
}


export function useField<T>(path: string): (() => FieldState<T>) {
  const form = useForm()
  const uf = useContext(fieldStatusesContext)!

  const getMeta = () => {
    const meta = form.fieldMetas()[path] 
    if(!meta) {
      form.setFieldMetas((prev) => ({
        ...prev,
        [path]: defaultFieldMetaState
      }))
      return defaultFieldMetaState
    } 
    return meta
  } 

  const setStatus = (key: keyof FieldStatus, value: boolean) => {
    uf.setFieldStatuses((prev) => ({
      ...prev,
      [path]: {
        ...prev[path] ?? {
          isSettingMeta: false, 
          isSettingValue: false,
        },
        [key]: value
      }
    }))
  }

  const setValue = async (update: Update<T>) => {
    try {
      setStatus("isSettingValue", true)
      const next = await getUpdatedValue(get(form.state(), path), update)
      const state = form.state()
      const nextState = set(state, path, next)
      form.setState(nextState)
    } finally {
      setStatus("isSettingValue", false)
    }
  }

  const setMeta = async (update: Update<FieldMetaState>) => {
    try {
      setStatus("isSettingMeta", true)
      const next = await getUpdatedValue(getMeta(), update)
      form.setFieldMetas(prev => ({
        ...prev,
        [path]: next
      }))
    } catch {
      setStatus("isSettingMeta", false)
    }
  }

  const reset = () => setValue(get(form.initialState(), path))

  return () => ({
      value: get(form.state(), path),
      setValue,
      meta: getMeta(),
      setMeta,
      errors: form.errors().fieldErrors[path] ?? [],
      reset
  })
}

export type ArrayFieldState<T> = FieldState<T[]> & {
  push: (item: T) => Promise<void>,
  remove: (index: number) => Promise<void>,
  move: (from: number, to: number) => Promise<void>,
  insert: (index: number, item: T) => Promise<void>,
  replace: (index: number, item: T) => Promise<void>,
  clear: () => Promise<void>,
  swap: (indexA: number, indexB: number) => Promise<void>
}

export function useArrayField<T>(path: string): (() => ArrayFieldState<T>) {
  const field = useField<T[]>(path);

  return () => {
    const baseField = field();

    const push = async (item: T) => {
      await baseField.setValue(prev => [...prev, item]);
    };

    const remove = async (index: number) => {
      await baseField.setValue(prev => prev.filter((_, i) => i !== index));
    };

    const move = async (from: number, to: number) => {
      await baseField.setValue(prev => {
        const newArray = [...prev];
        const [removed] = newArray.splice(from, 1);
        newArray.splice(to, 0, removed!);
        return newArray;
      });
    };

    const insert = async (index: number, item: T) => {
      await baseField.setValue(prev => {
        const newArray = [...prev];
        newArray.splice(index, 0, item);
        return newArray;
      });
    };

    const replace = async (index: number, item: T) => {
      await baseField.setValue(prev => {
        const newArray = [...prev];
        newArray[index] = item;
        return newArray;
      });
    };

    const clear = async () => {
      await baseField.setValue([]);
    };

    const swap = async (indexA: number, indexB: number) => {
      await baseField.setValue(prev => {
        const newArray = [...prev];
        const temp = newArray[indexA]!;
        newArray[indexA] = newArray[indexB]!;
        newArray[indexB] = temp;
        return newArray;
      });
    };

    return {
      ...baseField,
      push,
      remove,
      move,
      insert,
      replace,
      clear,
      swap
    };
  };
};

export function useForm<T = any,>(): FormContext<T> {
  const c = useContext(formContext)
  if(!c) {
    throw new Error("@gapu/formix: useForm/useField should be used under the 'Form' provider")
  }
  return c
}
