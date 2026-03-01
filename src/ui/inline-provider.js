const vscode = require('vscode');

class InlineActionProvider {
  constructor() {
    this._kind = vscode.CodeActionKind.RefactorRewrite;
  }

  provideCodeActions(document, range) {
    if (range.isEmpty) return [];

    const actions = [];

    const askAction = new vscode.CodeAction('AI Agent: Ask About Selection', vscode.CodeActionKind.Empty);
    askAction.command = {
      command: 'aiAgent.askAboutSelection',
      title: 'Ask About Selection',
    };
    actions.push(askAction);

    const explainAction = new vscode.CodeAction('AI Agent: Explain This Code', vscode.CodeActionKind.Empty);
    explainAction.command = {
      command: 'aiAgent.explainSelection',
      title: 'Explain Code',
    };
    actions.push(explainAction);

    const refactorAction = new vscode.CodeAction('AI Agent: Refactor', this._kind);
    refactorAction.command = {
      command: 'aiAgent.refactorSelection',
      title: 'Refactor',
    };
    actions.push(refactorAction);

    return actions;
  }
}

InlineActionProvider.metadata = {
  providedCodeActionKinds: [
    vscode.CodeActionKind.Empty,
    vscode.CodeActionKind.RefactorRewrite,
  ],
};

module.exports = InlineActionProvider;
