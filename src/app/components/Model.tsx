"use client";
import React from "react";

type ModelProps = {
  model: string;
  output: string;
};

const Model: React.FC<ModelProps> = ({ model, output }) => {
  return (
    <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 6 }}>
      <h3 style={{ margin: 0 }}>{model}</h3>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{output}</pre>
    </div>
  );
};

export default Model;
