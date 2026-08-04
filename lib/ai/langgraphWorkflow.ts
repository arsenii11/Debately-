import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

export type LangGraphNode<TState extends Record<string, unknown>> = {
  name: string;
  run: (state: TState) => Promise<Partial<TState>> | Partial<TState>;
};

type CompiledWorkflow<TState extends Record<string, unknown>> = {
  invoke: (input: TState) => Promise<TState>;
};

type MutableWorkflowGraph<TState extends Record<string, unknown>> = {
  addNode: (
    name: string,
    run: LangGraphNode<TState>["run"],
  ) => MutableWorkflowGraph<TState>;
  addEdge: (from: string, to: string) => MutableWorkflowGraph<TState>;
  compile: () => CompiledWorkflow<TState>;
};

export async function runLangGraphWorkflow<TState extends Record<string, unknown>>(
  initialState: TState,
  nodes: LangGraphNode<TState>[],
): Promise<TState> {
  if (nodes.length === 0) return initialState;

  const channels = Object.fromEntries(
    Object.keys(initialState).map((key) => [
      key,
      Annotation<unknown>({
        value: (_current, update) => update,
        default: () => initialState[key],
      }),
    ]),
  );
  const stateAnnotation = Annotation.Root(channels as never);
  const GraphCtor = StateGraph as unknown as new (
    state: unknown,
  ) => MutableWorkflowGraph<TState>;
  let graph = new GraphCtor(stateAnnotation);

  for (const node of nodes) {
    graph = graph.addNode(node.name, node.run);
  }

  graph = graph.addEdge(START, nodes[0]!.name);
  for (let i = 0; i < nodes.length - 1; i++) {
    graph = graph.addEdge(nodes[i]!.name, nodes[i + 1]!.name);
  }
  graph = graph.addEdge(nodes[nodes.length - 1]!.name, END);

  return graph.compile().invoke(initialState);
}
