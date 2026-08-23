package com.rifim.raos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.rifim.raos.camera.RaosCameraBridgePlugin;
import com.rifim.raos.location.RaosLocationBridgePlugin;
import com.rifim.raos.microphone.RaosMicrophoneBridgePlugin;
import com.rifim.raos.notification.RaosNotificationChannels;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RaosLocationBridgePlugin.class);
        registerPlugin(RaosCameraBridgePlugin.class);
        registerPlugin(RaosMicrophoneBridgePlugin.class);
        super.onCreate(savedInstanceState);
        RaosNotificationChannels.createAll(this);
    }
}
