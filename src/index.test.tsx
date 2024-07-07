import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@solidjs/testing-library";
import { createRoot } from "solid-js"
import { createForm, Form, defaultFieldMetaState, type FormixError, useForm, useField, useArrayField } from ".";
import { z } from "zod";

describe("Form Initialization", () => {
  const schema = z.object({
    name: z.string().min(3),
    age: z.number().min(18),
  });

  type FormState = z.infer<typeof schema>;

  const initialState: FormState = {
    name: "",
    age: 0,
  };

  it("should initialize with synchronous initial state", async () => {
    const form = createForm({
      schema,
      initialState,
      onSubmit: vi.fn(),
    });

    await waitFor(() => {
      expect(form.state()).toEqual(initialState);
      expect(form.initialState()).toEqual(initialState);
    })
  });

  it("should initialize with asynchronous initial state", async () => {
    const asyncInitialState = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { name: "John Doe", age: 30 };
    };

    const form = createForm({
      schema,
      initialState: asyncInitialState,
      onSubmit: vi.fn(),
    });

    expect(form.state()).toBeNull();

    await waitFor(() => {
      expect(form.state()).toEqual({ name: "John Doe", age: 30 });
      expect(form.initialState()).toEqual({ name: "John Doe", age: 30 });
    })
  });

  it("should validate initial state", async () => {
    const invalidInitialState = {
      name: "Jo",
      age: 16,
    };

    const form = createForm({
      schema,
      initialState: invalidInitialState,
      onSubmit: vi.fn(),
    });

    await waitFor(() => {
      expect(form.errors()).toHaveLength(2);
      expect(form.errors()[0]?.path).toBe("name");
      expect(form.errors()[1]?.path).toBe("age");
    })
  });

  it("should initialize nested object schemas", async () => {
    const nestedSchema = z.object({
      user: z.object({
        name: z.string().min(3),
        email: z.string().email(),
      }),
      settings: z.object({
        notifications: z.boolean(),
      }),
    });

    const nestedInitialState = {
      user: {
        name: "John Doe",
        email: "john@example.com",
      },
      settings: {
        notifications: true,
      },
    };

    const form = createForm({
      schema: nestedSchema,
      initialState: nestedInitialState,
      onSubmit: vi.fn(),
    });

    await waitFor(() => {
      expect(form.state()).toEqual(nestedInitialState);
    })
  });

  it("should initialize array fields", async () => {
    const arraySchema = z.object({
      tags: z.array(z.string()),
      users: z.array(z.object({
        name: z.string(),
        age: z.number(),
      })),
    });

    const arrayInitialState = {
      tags: ["react", "typescript"],
      users: [
        { name: "John", age: 30 },
        { name: "Jane", age: 28 },
      ],
    };

    const form = createForm({
      schema: arraySchema,
      initialState: arrayInitialState,
      onSubmit: vi.fn(),
    });

    await waitFor(() => {
      expect(form.state()).toEqual(arrayInitialState);
    })
  });
});

describe("createForm", () => {
  const schema = z.object({
    name: z.string().min(3),
    age: z.number().min(18),
  });

  type FormState = z.infer<typeof schema>;

  const initialState: FormState = {
    name: "",
    age: 0,
  };

  let onSubmit = vi.fn();

  let form: ReturnType<typeof createForm<typeof schema, FormState>>;

  beforeEach(() => {
    onSubmit = vi.fn();
    form = createForm({
      schema,
      initialState,
      onSubmit,
    });
  });

  it("should initialize with the correct initial state", () => {
    expect(form.state()).toEqual(initialState);
  });

  it("should update state correctly", async () => {
    await form.setState({ name: "John", age: 25 });
    expect(form.state()).toEqual({ name: "John", age: 25 });
  });

  it("should validate the form state", async () => {
    await form.setState({ name: "Jo", age: 17 });
    expect(form.errors()).toEqual([
      {
        path: "name",
        message: "String must contain at least 3 character(s)",
      },
      {
        path: "age",
        message: "Number must be greater than or equal to 18",
      },
    ] satisfies FormixError[]);
  });

  it("should call onSubmit when form is valid", async () => {
    await form.setState({ name: "John", age: 25 });
    await form.submit();
    expect(onSubmit).toHaveBeenCalledWith({ name: "John", age: 25 });
  });

  it("should not call onSubmit when form is invalid", async () => {
    await form.setState({ name: "Jo", age: 17 });
    await form.submit();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should reset the form state", async () => {
    await form.setState({ name: "John", age: 25 });
    await form.reset();
    expect(form.state()).toEqual(initialState);
  });

  it("should handle undo and redo operations", async () => {
    await form.setState({ name: "John", age: 25 });

    await form.setState({ name: "Jane", age: 30 });

    expect(form.canUndo()).toBe(true);
    await form.undo();

    expect(form.canRedo()).toBe(true);
    await form.redo();
  });

  it("should update field value correctly", async () => {
    await form.setFieldValue("name", "Alice");
    expect(form.state()?.name).toBe("Alice");
  });

  it("should update field meta correctly", async () => {
    await form.setFieldMeta("name", {
      ...defaultFieldMetaState,
      touched: true,
    });
    expect(form.fieldMetas().name?.touched).toBe(true);
  });

  it("should detect if form was modified", async () => {
    expect(form.wasModified()).toBe(false);
    await form.setState({ name: "John", age: 25 });
    expect(form.wasModified()).toBe(true);
  });

  it("should handle nested object schemas", async () => {
    const nestedSchema = z.object({
      user: z.object({
        name: z.string().min(3),
        email: z.string().email(),
      }),
    });
    const nestedForm = createForm({
      schema: nestedSchema,
      initialState: { user: { name: "", email: "" } },
      onSubmit: vi.fn(),
    });

    await nestedForm.setFieldValue("user.name", "John");
    await nestedForm.setFieldValue("user.email", "john@example.com");

    expect(nestedForm.state()).toEqual({
      user: { name: "John", email: "john@example.com" },
    });
  });

  it("should handle array fields", async () => {
    const arraySchema = z.object({
      tags: z.array(z.string()),
    });
    const arrayForm = createForm({
      schema: arraySchema,
      initialState: { tags: [] },
      onSubmit: vi.fn(),
    });

    await arrayForm.setFieldValue("tags", ["tag1", "tag2"]);
    expect(arrayForm.state()).toEqual({ tags: ["tag1", "tag2"] });

    await arrayForm.setFieldValue("tags.0", "updatedTag");
    expect(arrayForm.state()).toEqual({ tags: ["updatedTag", "tag2"] });
  });

  it("should handle multiple undo/redo operations", async () => {
    await form.setState({ name: "John", age: 25 });
    await form.setState({ name: "Jane", age: 30 });
    await form.setState({ name: "Bob", age: 35 });

    await form.undo(2);
    expect(form.state()).toEqual({ name: "John", age: 25 });

    await form.redo();
    expect(form.state()).toEqual({ name: "Jane", age: 30 });

    expect(form.canUndo()).toBe(true);
    expect(form.canRedo()).toBe(true);
  });

  it("should handle edge cases in undo/redo", async () => {
    expect(form.canUndo()).toBe(false);
    expect(form.canRedo()).toBe(false);

    await form.setState({ name: "John", age: 25 });
    expect(form.canUndo()).toBe(true);
    expect(form.canRedo()).toBe(false);

    await form.undo();
    expect(form.canUndo()).toBe(false);
    expect(form.canRedo()).toBe(true);

    await form.redo();
    expect(form.canUndo()).toBe(true);
    expect(form.canRedo()).toBe(false);
  });

  it("should handle async initialState", async () => {
    const asyncForm = createForm({
      schema,
      initialState: async () => ({ name: "Async", age: 30 }),
      onSubmit: vi.fn(),
    });

    await waitFor(() => {
      expect(asyncForm.state()).toEqual({ name: "Async", age: 30 });
    })
  });

  it("should handle async onSubmit", async () => {
    const asyncOnSubmit = vi.fn().mockResolvedValue("success");
    const asyncForm = createForm({
      schema,
      initialState,
      onSubmit: asyncOnSubmit,
    });

    await asyncForm.setState({ name: "John", age: 25 });
    await asyncForm.submit();

    expect(asyncOnSubmit).toHaveBeenCalledWith({ name: "John", age: 25 });
  });

  it("should handle form-level errors", async () => {
    const schema = z
      .object({
        password: z.string(),
        confirmPassword: z.string(),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: [],
      });

    const form = createForm({
      schema: schema,
      initialState: { password: "", confirmPassword: "" },
      onSubmit: vi.fn(),
    });
    await form.setState({ password: "pass123", confirmPassword: "pass456" });
    expect(form.errors()).toEqual([
      {
        path: "",
        message: "Passwords don't match",
      },
    ] satisfies FormixError[]);
  });

  it("should handle custom validation", async () => {
    const customSchema = z.object({
      username: z.string().refine(
        async (val) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return val !== "taken";
        },
        { message: "Username is already taken" },
      ),
    });

    const customForm = createForm({
      schema: customSchema,
      initialState: { username: "" },
      onSubmit: vi.fn(),
    });

    await customForm.setFieldValue("username", "taken");
    await customForm.submit();

    expect(customForm.errors()).toEqual([
      {
        path: "username",
        message: "Username is already taken",
      },
    ] satisfies FormixError[]);
  });
});

describe('Form Component', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  const initialState = {
    name: '',
    age: 0,
  };

  const onSubmit = vi.fn();

  it('renders children correctly', () => {
    const context = createForm({ schema, initialState, onSubmit });
    const { getByText } = render(() => (
      <Form context={context}>
        <div>Form Content</div>
      </Form>
    ));

    expect(getByText('Form Content')).toBeInTheDocument();
  });

  it('calls onSubmit when form is submitted', async () => {
    const context = createForm({ schema, initialState, onSubmit });
    const { getByText } = render(() => (
      <Form context={context}>
        <button type="submit">Submit</button>
      </Form>
    ));

    const submitButton = getByText('Submit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    })
  });

  it('renders a form element', () => {
    const context = createForm({ schema, initialState, onSubmit });
    const { container } = render(() => (
      <Form context={context}>
        <div>Form Content</div>
      </Form>
    ));

    expect(container.querySelector('form')).toBeInTheDocument();
  });
});

describe('useForm Hook', () => {
  it('throws error when used outside of Form provider', () => {
    const TestComponent = () => {
      useForm();
      return null;
    };

    expect(() => {
      createRoot(() => render(() => <TestComponent />));
    }).toThrow("@gapu/formix: useField, useArrayField and useForm can only be used under the 'Form' provider");
  });
});

describe('useField Hook', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
    isActive: z.boolean(),
  });

  const initialState = {
    name: 'John Doe',
    age: 30,
    isActive: true,
  };

  const onSubmit = vi.fn();

  function TestComponent({ path }: { path: string }) {
    const field = useField(path);
    return (
      <div>
        <span data-testid="value">{JSON.stringify(field.value())}</span>
        <span data-testid="errors">{JSON.stringify(field.errors())}</span>
        <span data-testid="meta">{JSON.stringify(field.meta())}</span>
        <span data-testid="status">{JSON.stringify(field.status())}</span>
        <button onClick={() => field.setValue('New Value')}>Set Value</button>
        <button onClick={() => {
          field.setValue(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return 'Async New Value'
          });
        }}>Set Async Value</button>
        <button onClick={() => field.setMeta(prev => ({ ...prev, touched: true }))}>Set Meta</button>
        <button onClick={() => field.reset()}>Reset</button>
      </div>
    );
  }

  function setup(path: string) {
    const context = createForm({ schema, initialState, onSubmit });
    return render(() => (
      <Form context={context}>
        <TestComponent path={path} />
      </Form>
    ));
  }

  it('returns correct initial value', async () => {
    const { getByTestId } = setup('name');
    await waitFor(() => {
      expect(getByTestId('value').textContent).toBe('"John Doe"');
    })
  });

  it('updates value correctly', async () => {
    const { getByTestId, getByText } = setup('name');
    fireEvent.click(getByText('Set Value'));
    await waitFor(() => {
      expect(getByTestId('value').textContent).toBe('"New Value"');
    })
  });

  it('updates meta correctly', async () => {
    const { getByTestId, getByText } = setup('name');

    fireEvent.click(getByText('Set Meta'));

    await waitFor(() => {
      const meta = JSON.parse(getByTestId('meta').textContent || '{}');
      expect(meta.touched).toBe(true);
    });
  });

  it('resets field to initial value', async () => {
    const { getByTestId, getByText } = setup('name');
    await fireEvent.click(getByText('Set Value'));
    await fireEvent.click(getByText('Reset'));
    expect(getByTestId('value').textContent).toBe('"John Doe"');
  });

  it('handles errors correctly', async () => {
    const context = createForm({
      schema,
      initialState: { ...initialState, age: 'invalid' as any },
      onSubmit,
    });

    const { getByTestId } = render(() => (
      <Form context={context}>
        <TestComponent path="age" />
      </Form>
    ));

    await waitFor(() => {
      const errors = JSON.parse(getByTestId('errors').textContent || '[]');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Expected number');
    });
  });

  it('returns correct isRequired value', () => {
    let isRequiredResult: boolean | undefined;

    const TestIsRequired = () => {
      const field = useField('name');
      isRequiredResult = field.isRequired();
      return null;
    };

    const context = createForm({ schema, initialState, onSubmit });
    render(() => (
      <Form context={context}>
        <TestIsRequired />
      </Form>
    ));

    expect(isRequiredResult).toBe(true);
  });

  it('returns correct wasModified value', async () => {
    let wasModifiedResult: boolean | undefined;

    const TestWasModified = () => {
      const field = useField('name');
      wasModifiedResult = field.wasModified();
      return (
        <button onClick={async () => {
          await field.setValue('Modified Value')
          wasModifiedResult = field.wasModified()
        }}>
          Modify
        </button>
      );
    };

    const context = createForm({ schema, initialState, onSubmit });
    const { getByText } = render(() => (
      <Form context={context}>
        <TestWasModified />
      </Form>
    ));

    expect(wasModifiedResult).toBe(false);

    fireEvent.click(getByText('Modify'));

    await waitFor(() => {
      expect(wasModifiedResult).toBe(true);
    })
  });

  it('returns correct initial status', () => {
    const { getByTestId } = setup('name');
    const status = JSON.parse(getByTestId('status').textContent || '{}');
    expect(status).toEqual({
      isSettingMeta: false,
      isSettingValue: false,
    });
  });

  it('updates status when setting value asynchronously', async () => {
    const { getByTestId, getByText } = setup('name');

    const getStatus = () => JSON.parse(getByTestId('status').textContent || '{}');
    const getValue = () => JSON.parse(getByTestId('value').textContent || '""');

    expect(getStatus().isSettingValue).toBe(false);

    fireEvent.click(getByText('Set Async Value'));

    await waitFor(() => {
      expect(getStatus().isSettingValue).toBe(true);
    });

    await waitFor(() => {
      expect(getStatus().isSettingValue).toBe(false);
      expect(getValue()).toBe('Async New Value');
    });
  });

  it('updates status when setting meta', async () => {
    const { getByTestId, getByText } = setup('name');

    const getStatus = () => JSON.parse(getByTestId('status').textContent || '{}');
    expect(getStatus().isSettingMeta).toBe(false);

    fireEvent.click(getByText('Set Meta'));
    expect(getStatus().isSettingMeta).toBe(true);

    await waitFor(() => {
      expect(getStatus().isSettingMeta).toBe(false);
    })
  });
});

describe('useArrayField Hook', () => {
  const schema = z.object({
    items: z.array(z.string()),
  });

  const initialState = {
    items: ['item1', 'item2', 'item3'],
  };

  const onSubmit = vi.fn();

  function TestComponent() {
    const arrayField = useArrayField<string>('items');
    return (
      <div>
        <span data-testid="value">{JSON.stringify(arrayField.value())}</span>
        <button onClick={() => arrayField.push('newItem')}>Push</button>
        <button onClick={() => arrayField.remove(1)}>Remove</button>
        <button onClick={() => arrayField.move(0, 2)}>Move</button>
        <button onClick={() => arrayField.insert(1, 'insertedItem')}>Insert</button>
        <button onClick={() => arrayField.replace(0, 'replacedItem')}>Replace</button>
        <button onClick={() => arrayField.empty()}>Empty</button>
        <button onClick={() => arrayField.swap(0, 2)}>Swap</button>
      </div>
    );
  }

  function setup() {
    const context = createForm({ schema, initialState, onSubmit });
    return render(() => (
      <Form context={context}>
        <TestComponent />
      </Form>
    ));
  }

  it('initializes with correct value', async () => {
    const { getByTestId } = setup();
    await waitFor(() => {
      expect(JSON.parse(getByTestId('value').textContent || '[]')).toEqual(['item1', 'item2', 'item3']);
    });
  });

  it('pushes new item correctly', async () => {
    const { getByTestId, getByText } = setup();
    fireEvent.click(getByText('Push'));
    await waitFor(() => {
      expect(JSON.parse(getByTestId('value').textContent || '[]')).toEqual(['item1', 'item2', 'item3', 'newItem']);
    });
  });

  it('removes item correctly', async () => {
    const { getByTestId, getByText } = setup();
    fireEvent.click(getByText('Remove'));
    await waitFor(() => {
      expect(JSON.parse(getByTestId('value').textContent || '[]')).toEqual(['item1', 'item3']);
    });
  });

  it('moves item correctly', async () => {
    const { getByTestId, getByText } = setup();
    fireEvent.click(getByText('Move'));
    await waitFor(() => {
      expect(JSON.parse(getByTestId('value').textContent || '[]')).toEqual(['item2', 'item3', 'item1']);
    });
  });

  it('inserts item correctly', async () => {
    const { getByTestId, getByText } = setup();
    await fireEvent.click(getByText('Insert'));
    await waitFor(() => {
      expect(JSON.parse(getByTestId('value').textContent || '[]')).toEqual(['item1', 'insertedItem', 'item2', 'item3']);
    });
  });

  it('replaces item correctly', async () => {
    const { getByTestId, getByText } = setup();
    fireEvent.click(getByText('Replace'));
    await waitFor(() => {
      expect(JSON.parse(getByTestId('value').textContent || '[]')).toEqual(['replacedItem', 'item2', 'item3']);
    });
  });

  it('empties array correctly', async () => {
    const { getByTestId, getByText } = setup();
    fireEvent.click(getByText('Empty'));
    await waitFor(() => {
      expect(JSON.parse(getByTestId('value').textContent || '[]')).toEqual([]);
    });
  });

  it('swaps items correctly', async () => {
    const { getByTestId, getByText } = setup();
    fireEvent.click(getByText('Swap'));
    await waitFor(() => {
      expect(JSON.parse(getByTestId('value').textContent || '[]')).toEqual(['item3', 'item2', 'item1']);
    });
  });
});
