package com.rifim.raos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.rifim.raos.location.RaosLocationBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RaosLocationBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
